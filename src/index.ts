#!/usr/bin/env node

import { execSync } from "child_process";
import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";

// Fonction principale
const init = async () => {
  console.log("🚀 Setting up authentication for your Next.js project...");

  // Demander le nom du projet et le type d'authentification
  const { projectName, authType } = await inquirer.prompt([
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
      ],
    },
  ]);

  // Détecter ou installer Next.js
  const projectPath = path.join(process.cwd(), projectName);
  process.chdir(projectPath);

  let nextInstalled = false;
  try {
    require.resolve("next");
    nextInstalled = true;
  } catch {
    console.log("❌ Next.js non détecté. Installez-le avant de continuer.");
    process.exit(1);
  }

  // Vérification du type de router (Pages Router ou App Router)
  const checkRouterType = () => {
    let baseDir = process.cwd();

    // Vérifie si le dossier src existe
    const srcDirExists = fs.existsSync(path.join(baseDir, "src"));
    if (srcDirExists) {
      baseDir = path.join(baseDir, "src");
    }

    // Vérifie si le dossier 'app' existe pour l'App Router
    const appDirExists = fs.existsSync(path.join(baseDir, "app"));

    // Vérifie si le dossier 'pages' existe pour le Pages Router
    const pagesDirExists = fs.existsSync(path.join(baseDir, "pages"));

    if (appDirExists) {
      console.log("✅ App Router détecté.");
      return { router: "app-router", baseDir };
    } else if (pagesDirExists) {
      console.log("✅ Pages Router détecté.");
      return { router: "pages-router", baseDir };
    } else {
      console.log(
        "❌ Aucun router détecté. Assurez-vous d'avoir un projet Next.js valide."
      );
      process.exit(1);
    }
  };

  // Appeler la fonction pour déterminer quel router est utilisé
  const { router: routerType, baseDir } = checkRouterType();

  // Installer les packages nécessaires en fonction du type d'authentification
  if (authType.includes("Providers (Google, GitHub, etc.)")) {
    console.log("Installation de NextAuth.js...");
    execSync("npm install next-auth@5.0.0-beta.18", { stdio: "inherit" });
  }

  if (authType.includes("Magic Link")) {
    console.log("Installation de NextAuth Email...");
    execSync("npm install next-auth-email", { stdio: "inherit" });
  }

  if (authType.includes("Credentials")) {
    console.log("Installation de bcryptjs...");
    execSync("npm install bcryptjs", { stdio: "inherit" });
  }

  // Créer les fichiers de configuration
  console.log("Création des fichiers de configuration...");

  // Chemins des fichiers selon le type de router et la présence de "src"
  const apiPath =
    routerType === "app-router"
      ? path.join(baseDir, "app/api/auth/[...nextauth]/route.ts")
      : path.join(baseDir, "pages/api/auth/[...nextauth].ts");

  const authFilePath = path.join(baseDir, "auth.ts");

  // Créer le fichier "auth.ts" à la racine
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
        // Implement your own schema here
        const validatedFields = YourSchemaHere.safeParse(credentials);
        if (validatedFields.success) {
          const { email, password } = validatedFields.data;
          // Use your own logic to get the user by email here
          const user = await getUserByEmail(email)
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

  fs.outputFileSync(authFilePath, authConfigContent);

  // Créer le fichier selon le type de Router
  const apiContent =
    routerType === "app-router"
      ? `import { handlers } from "@/auth";

export const { GET, POST } = handlers;`
      : `import NextAuth from "next-auth";
import { auth } from "@/auth";

export default NextAuth(auth);`;

  fs.outputFileSync(apiPath, apiContent);

  console.log("✅ Configuration complète !");

  // Afficher les dernières instructions
  console.log(`\n👉 Vous pouvez démarrer votre projet avec : \n\nnpm run dev`);
};

// Exécuter la fonction principale
init().catch((err) => console.error("❌ Error:", err));
