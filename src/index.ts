#!/usr/bin/env node
import { execSync } from "child_process";
import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";

// Fonction pour rechercher récursivement un dossier spécifique avec vérification du dossier src
const findDirectoryWithSrc = (
  baseDir: string,
  dirName: string
): string | null => {
  // Vérifier d'abord dans le dossier courant
  const mainDir = findDirectoryRecursively(baseDir, dirName);
  if (mainDir) return mainDir;

  // Si pas trouvé, vérifier dans le dossier "src"
  const srcDir = path.join(baseDir, "src");
  if (fs.existsSync(srcDir)) {
    return findDirectoryRecursively(srcDir, dirName);
  }

  return null;
};

// Fonction pour rechercher récursivement un dossier spécifique
const findDirectoryRecursively = (
  baseDir: string,
  dirName: string
): string | null => {
  const dirs = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const dir of dirs) {
    if (dir.isDirectory() && dir.name !== ".next") {
      const currentPath = path.join(baseDir, dir.name);
      if (dir.name === dirName) {
        return currentPath;
      }

      // Recherche récursive dans les sous-dossiers
      const foundDir = findDirectoryRecursively(currentPath, dirName);
      if (foundDir) return foundDir;
    }
  }
  return null;
};

// Fonction principale
const init = async () => {
  console.log("🚀 Setting up authentication for your Next.js project...");

  // Configuration étendue
  const { projectName, authType, authStrategy, database } =
    await inquirer.prompt([
      {
        type: "input",
        name: "projectName",
        message: "Nom du projet Next.js (laisser vide pour le projet courant):",
        default: ".",
      },
      {
        type: "checkbox",
        name: "authType",
        message: "Choisir les types d'authentification :",
        choices: [
          "Providers (Google, GitHub, etc.)",
          "Credentials",
          "Magic Link",
          "Email/Password",
        ],
      },
      {
        type: "list",
        name: "authStrategy",
        message: "Choisir la stratégie d'authentification :",
        choices: ["JWT", "Database Session"],
      },
      {
        type: "list",
        name: "database",
        message: "Choisir la base de données (pour Database Session) :",
        choices: ["MongoDB", "PostgreSQL", "MySQL", "None"],
        when: (answers) => answers.authStrategy === "Database Session",
      },
    ]);

  // Détecter ou installer Next.js
  const projectPath = path.join(process.cwd(), projectName);
  process.chdir(projectPath);

  const nextInstalled = await checkNext();
  if (!nextInstalled) {
    console.log("❌ Next.js non détecté. Installez-le avant de continuer.");
    process.exit(1);
  }

  // Vérifier la version de Next.js
  const getNextVersion = () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      console.log(
        "❌ package.json non trouvé. Êtes-vous dans un projet Next.js ?"
      );
      process.exit(1);
    }

    try {
      const packageJson = fs.readJsonSync(packageJsonPath);
      const version =
        packageJson.dependencies?.next || packageJson.devDependencies?.next;

      if (!version) {
        console.log("❌ Next.js n'est pas installé dans le package.json");
        process.exit(1);
      }

      return version;
    } catch (error) {
      console.log("❌ Erreur lors de la lecture du package.json");
      console.error(error);
      process.exit(1);
    }
  };

  const nextVersion = getNextVersion();
  const isNext13OrHigher = nextVersion
    ? parseInt(nextVersion.split(".")[0]) >= 13
    : false;

  const nextMajorVersion = parseInt(nextVersion.split(".")[0]);
  checkCompatibility(nextMajorVersion);

  // Installation des dépendances en fonction des choix
  const installDependencies = async () => {
    try {
      // Vérifier la version de Next.js et installer la version appropriée de NextAuth
      const nextAuthVersion = "5.0.0-beta.18";

      const dependencies = [
        `next-auth@${nextAuthVersion}`,
        authStrategy === "Database Session" ? "@auth/core" : "",
        database === "MongoDB" ? "mongodb" : "",
        database === "PostgreSQL" ? "@prisma/client prisma" : "",
        database === "MySQL" ? "@prisma/client prisma" : "",
        authType.includes("Credentials") ? "bcryptjs @types/bcryptjs" : "",
        "zod",
        "bcryptjs",
      ].filter(Boolean);

      console.log("📦 Installation des dépendances...");

      // Ajouter --legacy-peer-deps pour éviter les conflits
      execSync(`npm install ${dependencies.join(" ")} --legacy-peer-deps`, {
        stdio: "inherit",
        env: { ...process.env, FORCE_COLOR: "1" }, // Pour garder la coloration dans la console
      });
    } catch (error) {
      console.error(
        "❌ Erreur lors de l'installation des dépendances :",
        error
      );
      console.log(
        "💡 Essayez d'installer manuellement avec : npm install next-auth --legacy-peer-deps"
      );
      process.exit(1);
    }
  };

  await installDependencies();

  // Générer la configuration de base de données
  if (authStrategy === "Database Session") {
    const dbConfig = generateDatabaseConfig(database);
    fs.outputFileSync(path.join(process.cwd(), "lib/db.ts"), dbConfig);
  }

  // Vérification du type de router (Pages Router ou App Router)
  const checkRouterType = () => {
    let baseDir = process.cwd();

    // Chercher dans le dossier courant ou dans "src"
    const appDirPath = findDirectoryWithSrc(baseDir, "app");
    const pagesDirPath = findDirectoryWithSrc(baseDir, "pages");

    if (appDirPath) {
      console.log("✅ App Router détecté.");
      return { router: "app-router", baseDir: appDirPath };
    } else if (pagesDirPath) {
      console.log("✅ Pages Router détecté.");
      return { router: "pages-router", baseDir: pagesDirPath };
    } else {
      console.log(
        "❌ Aucun router détecté. Assurez-vous d'avoir un projet Next.js valide."
      );
      process.exit(1);
    }
  };

  // Appeler la fonction pour déterminer quel router est utilisé
  const { router: routerType, baseDir } = checkRouterType();

  // Créer les fichiers de configuration
  console.log("Création des fichiers de configuration...");

  // Chemins des fichiers selon le type de router
  const apiDirPath =
    routerType === "app-router"
      ? path.join(baseDir, "api/auth/[...nextauth]")
      : path.join(baseDir, "pages/api/auth/[...nextauth]");

  const apiFilePath =
    routerType === "app-router"
      ? path.join(apiDirPath, "route.ts")
      : path.join(apiDirPath, "[...nextauth].ts");

  const authFilePath = path.join(process.cwd(), "auth.ts");

  // Créer le fichier auth.ts
  const authConfigContent = `
import NextAuth, { NextAuthConfig } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
${
  authType.includes("Providers (Google, GitHub, etc.)") &&
  'import Google from "next-auth/providers/google";'
}
${
  authType.includes("Credentials") &&
  `import Credentials from "next-auth/providers/credentials";

  const YourSchemaHere = z.object({
    email: z.string().email(),
    password: z.string(),
  });
  
  const getUserByEmail = async (email: string) => {
    // Implement your own way to get the user by email
    const user = {
      username: "john.doe",
      email: "john.doe@example.com",
      password: "$2a$10$7Ks1f6R0lJW9qYb5J6RZ1uVZ1K2b2gW",
    };

    if (!user) return null;

    return user;
  };`
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    ${
      authType.includes("Credentials")
        ? `Credentials({
      async authorize(credentials) {
        const validatedFields = YourSchemaHere.safeParse(credentials);
        if (validatedFields.success) {
          const { email, password } = validatedFields.data;
          const user = await getUserByEmail(email);
          if (!user || !user.password) return null;
          const passwordsMatch = await bcrypt.compare(password, user.password);
          if (passwordsMatch) return user;
        }
        return null;
      },
    }),`
        : ""
    }
    ${
      authType.includes("Providers (Google, GitHub, etc.)")
        ? `Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),`
        : ""
    }
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.name = token.name ?? "";
        session.user.email = token.email ?? "";
      }
      return session;
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.sub = profile.id ?? "";
        token.username = profile.name || profile.email;
        token.email = profile.email;
      }
      return token;
    },
  },
} satisfies NextAuthConfig);
`;

  // Écriture du fichier auth.ts
  fs.outputFileSync(authFilePath, authConfigContent);

  // Créer le répertoire API de manière sûre avec fs.ensureDirSync
  console.log("Création du répertoire pour l'API NextAuth...");

  try {
    // Créer le répertoire API (et les dossiers parents s'ils n'existent pas)
    fs.ensureDirSync(apiDirPath);

    // Contenu du fichier route/api/auth en fonction du router
    const apiContent =
      routerType === "app-router"
        ? `import { handlers } from "@/auth";

export const { GET, POST } = handlers;`
        : `import NextAuth from "next-auth";
import { auth } from "@/auth";

export default NextAuth(auth);`;

    // Créer le fichier api/auth/[...nextauth]
    fs.outputFileSync(apiFilePath, apiContent);

    console.log(
      `✅ Le répertoire API et le fichier ${apiFilePath} ont été créés.`
    );
  } catch (error) {
    console.error("❌ Erreur lors de la création du répertoire API :", error);
  }

  // Générer les composants UI
  const uiComponents = generateUIComponents(routerType, authType);
  Object.entries(uiComponents).forEach(([fileName, content]) => {
    fs.outputFileSync(
      path.join(process.cwd(), "components/auth", fileName),
      content
    );
  });

  // Générer le schema Prisma si nécessaire
  if (database === "PostgreSQL" || database === "MySQL") {
    console.log("📝 Génération du schema Prisma...");
    const prismaSchema = generatePrismaSchema(database);
    fs.outputFileSync(
      path.join(process.cwd(), "prisma/schema.prisma"),
      prismaSchema
    );

    // Initialiser Prisma
    console.log("🔧 Initialisation de Prisma...");
    try {
      execSync("npx prisma generate", { stdio: "inherit" });
    } catch (error) {
      console.error("❌ Erreur lors de l'initialisation de Prisma:", error);
    }
  }

  // Ajouter cette fonction pour générer le fichier .env
  const generateEnvFile = () => {
    const envContent = `
# Généré par next-auth-automatic-setup
AUTH_SECRET="${
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    }"
# Ajoutez vos clés d'API ici
# GOOGLE_CLIENT_ID=""
# GOOGLE_CLIENT_SECRET=""
# DATABASE_URL=""
`;

    fs.outputFileSync(path.join(process.cwd(), ".env"), envContent);

    // Ajouter .env au .gitignore s'il existe
    const gitignorePath = path.join(process.cwd(), ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
      if (!gitignoreContent.includes(".env")) {
        fs.appendFileSync(gitignorePath, "\n.env\n");
      }
    }
  };

  // Générer le fichier .env avec le secret
  console.log("📝 Génération du fichier .env...");
  generateEnvFile();

  // Mettre à jour la partie qui gère le Provider
  if (routerType === "app-router") {
    console.log("📝 Mise à jour du layout...");
    updateLayoutFile(baseDir);
  } else {
    console.log("📝 Génération du Provider...");
    const providerContent = generateProviderComponent(routerType);
    fs.outputFileSync(
      path.join(process.cwd(), "pages/_app.tsx"),
      providerContent
    );
  }

  // Si c'est un App Router, modifier le layout.tsx pour inclure le Provider
  if (routerType === "app-router") {
    updateLayoutFile(baseDir);
  }

  console.log("✅ Configuration complète !");

  // Afficher les dernières instructions
  console.log(`\n👉 Vous pouvez démarrer votre projet avec : \n\nnpm run dev`);

  // À la fin, ajouter des instructions pour l'utilisateur
  console.log(
    "\n🔑 Un fichier .env a été créé avec un secret généré automatiquement"
  );
  console.log(
    "👉 N'oubliez pas d'ajouter vos propres clés d'API dans le fichier .env"
  );
};

// Fonction pour vérifier si Next.js est installé
const checkNext = async () => {
  try {
    execSync("npx next --version", { stdio: "ignore" });
    return true;
  } catch (error) {
    return false;
  }
};

// Fonction pour générer la configuration de la base de données
const generateDatabaseConfig = (database: string) => {
  switch (database) {
    case "MongoDB":
      return `
import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
`;
    case "PostgreSQL":
    case "MySQL":
      return `
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
`;
    default:
      return "";
  }
};

// Fonction pour générer les composants UI
const generateUIComponents = (routerType: string, authType: string[]) => {
  const components: Record<string, string> = {
    "LoginButton.tsx": `
import { signIn, signOut, useSession } from "next-auth/react";

export default function LoginButton() {
  const { data: session } = useSession();

  if (session) {
    return (
      <button onClick={() => signOut()}>
        Sign out
      </button>
    );
  }
  return (
    <button onClick={() => signIn()}>
      Sign in
    </button>
  );
}
`,
  };

  return components;
};

const checkCompatibility = (nextMajorVersion: number) => {
  if (nextMajorVersion < 13) {
    console.log("❌ Ce package nécessite Next.js 13 ou supérieur");
    process.exit(1);
  }

  if (nextMajorVersion >= 15) {
    console.log(
      "⚠️ Next.js 15 détecté. Certaines fonctionnalités pourraient ne pas être disponibles."
    );
    console.log(
      "💡 Nous recommandons d'utiliser Next.js 13 ou 14 pour une meilleure compatibilité."
    );
  }
};

const generatePrismaSchema = (database: string) => {
  const dbProvider = database === "PostgreSQL" ? "postgresql" : "mysql";

  return `
datasource db {
  provider = "${dbProvider}"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  password      String?
  accounts      Account[]
  sessions      Session[]
}

model Account {
  id                 String  @id @default(cuid())
  userId             String
  type               String
  provider           String
  providerAccountId  String
  refresh_token      String?  @db.Text
  access_token       String?  @db.Text
  expires_at         Int?
  token_type         String?
  scope              String?
  id_token           String?  @db.Text
  session_state      String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
`;
};

const generateProviderComponent = (routerType: string) => {
  if (routerType === "app-router") {
    return `
'use client';

import { SessionProvider } from "next-auth/react";

export default function Provider({ children, session }: { 
  children: React.ReactNode;
  session: any;
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
`;
  } else {
    return `
import { SessionProvider } from "next-auth/react";
import type { AppProps } from "next/app";

export default function App({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps) {
  return (
    <SessionProvider session={session}>
      <Component {...pageProps} />
    </SessionProvider>
  );
}
`;
  }
};

// Modifier la fonction qui gère le layout pour l'App Router
const updateLayoutFile = (baseDir: string) => {
  const layoutPath = path.join(baseDir, "layout.tsx");
  if (fs.existsSync(layoutPath)) {
    let layoutContent = fs.readFileSync(layoutPath, "utf-8");

    // Si le Provider n'est pas déjà inclus
    if (!layoutContent.includes("Provider")) {
      // Ajouter les imports nécessaires
      const imports = `import { headers } from 'next/headers';
import Provider from "@/app/providers";
import { auth } from "@/auth";`;

      // Remplacer l'import existant ou ajouter au début
      if (layoutContent.includes("import")) {
        layoutContent = layoutContent.replace(/import.*?;/, `${imports}`);
      } else {
        layoutContent = `${imports}\n\n${layoutContent}`;
      }

      // Modifier la fonction RootLayout
      layoutContent = layoutContent.replace(
        /export default function RootLayout[^{]*{/,
        `export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();`
      );

      // Wrapper le children avec le Provider
      layoutContent = layoutContent.replace(
        /<body[^>]*>(.*?)<\/body>/s,
        `<body>
          <Provider session={session}>
            $1
          </Provider>
        </body>`
      );
    }

    fs.writeFileSync(layoutPath, layoutContent);
  }
};

init().catch((err) => console.error("❌ Error:", err));
