#!/usr/bin/env node
import { execSync } from "child_process";
import fs from "fs-extra";
import inquirer from "inquirer";
import path from "path";
// Fonction pour rechercher récursivement un dossier spécifique avec vérification du dossier src
const findDirectoryWithSrc = (baseDir, dirName) => {
    // Vérifier d'abord dans le dossier courant
    const mainDir = findDirectoryRecursively(baseDir, dirName);
    if (mainDir)
        return mainDir;
    // Si pas trouvé, vérifier dans le dossier "src"
    const srcDir = path.join(baseDir, "src");
    if (fs.existsSync(srcDir)) {
        return findDirectoryRecursively(srcDir, dirName);
    }
    return null;
};
// Fonction pour rechercher récursivement un dossier spécifique
const findDirectoryRecursively = (baseDir, dirName) => {
    const dirs = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const dir of dirs) {
        if (dir.isDirectory() && dir.name !== ".next") {
            const currentPath = path.join(baseDir, dir.name);
            if (dir.name === dirName) {
                return currentPath;
            }
            // Recherche récursive dans les sous-dossiers
            const foundDir = findDirectoryRecursively(currentPath, dirName);
            if (foundDir)
                return foundDir;
        }
    }
    return null;
};
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
    const nextInstalled = await checkNext();
    if (!nextInstalled) {
        console.log("❌ Next.js non détecté. Installez-le avant de continuer.");
        process.exit(1);
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
        }
        else if (pagesDirPath) {
            console.log("✅ Pages Router détecté.");
            return { router: "pages-router", baseDir: pagesDirPath };
        }
        else {
            console.log("❌ Aucun router détecté. Assurez-vous d'avoir un projet Next.js valide.");
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
    // Chemins des fichiers selon le type de router
    const apiDirPath = routerType === "app-router"
        ? path.join(baseDir, "api/auth/[...nextauth]")
        : path.join(baseDir, "pages/api/auth/[...nextauth]");
    const apiFilePath = routerType === "app-router"
        ? path.join(apiDirPath, "route.ts")
        : path.join(apiDirPath, "[...nextauth].ts");
    const authFilePath = path.join(process.cwd(), "auth.ts");
    // Créer le fichier auth.ts
    const authConfigContent = `
import NextAuth, { NextAuthConfig } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
${authType.includes("Providers (Google, GitHub, etc.)") &&
        'import Google from "next-auth/providers/google";'}
${authType.includes("Credentials") &&
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
  };`}

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    ${authType.includes("Credentials")
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
        : ""}
    ${authType.includes("Providers (Google, GitHub, etc.)")
        ? `Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),`
        : ""}
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
        const apiContent = routerType === "app-router"
            ? `import { handlers } from "@/auth";

export const { GET, POST } = handlers;`
            : `import NextAuth from "next-auth";
import { auth } from "@/auth";

export default NextAuth(auth);`;
        // Créer le fichier api/auth/[...nextauth]
        fs.outputFileSync(apiFilePath, apiContent);
        console.log(`✅ Le répertoire API et le fichier ${apiFilePath} ont été créés.`);
    }
    catch (error) {
        console.error("❌ Erreur lors de la création du répertoire API :", error);
    }
    console.log("✅ Configuration complète !");
    // Afficher les dernières instructions
    console.log(`\n👉 Vous pouvez démarrer votre projet avec : \n\nnpm run dev`);
};
// Fonction pour vérifier si Next.js est installé
const checkNext = async () => {
    try {
        execSync("npx next --version", { stdio: "ignore" });
        return true;
    }
    catch (error) {
        return false;
    }
};
init().catch((err) => console.error("❌ Error:", err));
