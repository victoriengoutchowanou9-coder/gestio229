# GESTIONAFRICA ERP — Guide de Déploiement Vercel

Ce dossier contient l'intégralité du logiciel **GESTIONAFRICA ERP (Version Entreprise V3.0)** prêt pour un déploiement immédiat sur **Vercel** ou pour une utilisation locale sur Windows.

---

## 🚀 Méthodes de Déploiement sur Vercel

### Option A : Déploiement via Vercel CLI (Le plus rapide)
1. Ouvrez un terminal (PowerShell ou Invite de commandes) dans ce dossier :
   ```bash
   cd GESTIONAFRICA
   ```
2. Installez Vercel si ce n'est pas fait :
   ```bash
   npm install -g vercel
   ```
3. Déployez directement en production :
   ```bash
   vercel --prod
   ```
4. Suivez les instructions à l'écran (validez avec `Y`), Vercel vous donne immédiatement votre URL en ligne HTTPS !

---

### Option B : Déploiement via GitHub & Dashboard Vercel
1. Initialisez un dépôt Git dans ce dossier :
   ```bash
   git init
   git add .
   git commit -m "Initial commit GESTIONAFRICA ERP"
   ```
2. Poussez sur votre dépôt GitHub (ex: `https://github.com/votre-nom/gestionafrica`).
3. Connectez-vous sur [vercel.com](https://vercel.com).
4. Cliquez sur **« Add New... »** $\rightarrow$ **« Project »** $\rightarrow$ Importez votre repo GitHub.
5. Vercel détecte automatiquement la configuration `vercel.json` et déploie le site en 30 secondes.

---

## 💻 Utilisation Locale (Sans Internet / Bureau)
- Double-cliquez simplement sur **`LANCER_GESTIONAFRICA.bat`** ou ouvrez **`index.html`** dans n'importe quel navigateur (Chrome, Edge, Firefox, Safari).

---

## 📦 Contenu du Dossier GESTIONAFRICA
- `index.html` : Application complète (Hub Central Multi-établissements + 15 Applications Métiers + Sécurité RBAC + E-MECEF + SYSCOHADA).
- `inscription_multisecteurs.html` : Page d'inscription avec sélection des établissements et lieux.
- `activation_email.html` : Gabarit d'activation par email et code PIN.
- `manifest.json` : Configuration PWA installable sur Mobile Android, iOS et PC.
- `vercel.json` : Règles de routage Vercel SPA, headers de sécurité et URL propres.
- `database/` : Schémas SQL complets (PostgreSQL / Supabase / SQLite).
- `icons/` : Icônes haute résolution pour PWA et favicons.
