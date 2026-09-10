# GESTIO 229 ERP - Version Entreprise V3.0
> **Slogan : Votre gestion, au standard du Bénin**  
> *Date de version : 05 Septembre 2026 | Marché cible : Bénin & UEMOA (Afrique de l'Ouest)*

---

## 🌟 Présentation Générale
**GESTIO 229 ERP** est un progiciel de gestion intégrée SaaS modulaire 100% Cloud et Hors-ligne, spécialement développé pour répondre aux réalités économiques, fiscales et réglementaires des PME/TPE et grandes entreprises au Bénin.

Il centralise l'intégralité du cycle d'activité :
$$\text{Ventes} \longleftrightarrow \text{Stocks (Double)} \longleftrightarrow \text{Achats} \longleftrightarrow \text{Trésorerie / Caisses} \longleftrightarrow \text{RH \& Paie} \longleftrightarrow \text{Comptabilité SYSCOHADA}$$

---

## 🎯 Conformités & Normes Béninoises
- **Fiscalité DGI Bénin** :
  - Facturation normalisée **E-MECEF** avec génération de QR Code DGI et numéro NIM.
  - Gestion automatique de la **TVA 18%** et de l'**AIB** (1% avec IFU ou 5% sans IFU).
  - Identifiant Fiscal Unique (**IFU à 13 chiffres**) et **RCCM**.
- **Comptabilité OHADA** :
  - Plan comptable général **SYSCOHADA Révisé** (Classes 1 à 8).
  - Génération automatique des écritures de débit/crédit en temps réel (Pré-comptabilité).
  - États financiers : Bilan, Compte de Résultat, Balance et Grand Livre.
- **Paiements Mobiles Locaux** :
  - **MTN Mobile Money (*880#)**, **Moov Money (*855#)**, **Wave**, Espèces et Carte bancaire.
  - Multi-règlement dans une même vente.

---

## 📦 Les 8 Modules Opérationnels

| Module | Fonctionnalités Clés |
| :--- | :--- |
| **1. Commercial & POS** | Point de Vente tactile, panier multi-articles, multi-paiement split, grilles tarifaires (Standard, Gros, VIP), ventes différées, relances WhatsApp, factures d'avoir E-MECEF. |
| **2. Gestion des Stocks** | Double Stock (**Stock Magasin / Réserve** vs **Stock Vente / POS**), bons de transfert internes, inventaire physique avec valorisation des écarts en FCFA, fiche de stock journalière. |
| **3. Achats & Fournisseurs** | Cycle complet : **Bon de Commande (BC)** avec double signature électronique, **Bon de Livraison (BL)** avec contrôle de conformité, suivi des factures et dettes fournisseurs. |
| **4. Trésorerie & Caisses** | Double caisse POS (**Solde Espèces** et **Solde Mobile Money**), clôture de session avec rapport automatique par email, demandes de transfert vers trésorerie centrale, gestion des dépenses courantes. |
| **5. Gestion & RH** | Profils et permissions RBAC (Admin, Gérant, Caissier, Magasinier, Comptable), fiches employés, calcul des cotisations CNSS et IPTS Bénin, bulletins de salaire SYSCOHADA, journal d'audit immuable. |
| **6. Comptabilité SYSCOHADA** | Journaux auxiliaires (VT, AC, CA, MM, BQ, OD), lettrage automatique des tiers, rapprochement bancaire, balance générale, bilan et compte de résultat, export FEC / liasse fiscale. |
| **7. Reporting & CRM** | Tableaux de bord décisionnels pour banquiers/investisseurs, calcul de la marge brute et nette, classements des ventes, pavé de signature électronique sur tablette/smartphone. |
| **8. Multi-Secteurs Bénin** | 8 configurations prêtes à l'emploi : **Boutique**, **Restaurant/Maquis**, **Pharmacie**, **Quincaillerie**, **Hôtel**, **Station-Service**, **Cabinet/Services**, **École**. |

---

## 🚀 Démarrage Immédiat (Sur Windows)

### Option 1 : Lancement instantané sans installation
Double-cliquez simplement sur le fichier :
```text
LANCER_GESTIO229.bat
```
L'application s'ouvre directement dans votre navigateur web avec toutes les fonctionnalités actives hors-ligne.

### Option 2 : Déploiement Cloud (Supabase & Vercel)
1. **Base de Données Supabase** :
   - Créez un projet sur [Supabase](https://supabase.com).
   - Exécutez le script SQL complet situé dans `database/supabase_schema_gestio229.sql` dans le SQL Editor de Supabase.
2. **Déploiement Frontend** :
   - Importez le projet sur [Vercel](https://vercel.com) ou Netlify.
   - Les variables d'environnement Supabase peuvent être renseignées pour la synchronisation temps réel.

---

## 🖨️ Formats d'Impression Normalisés
- **Ticket Thermique 80mm** (Imprimantes POS USB/Bluetooth/Réseau) avec QR Code E-MECEF.
- **Facture Laser A4 Normalisée** avec mentions légales DGI Bénin et cadre de certification.
- **Bons de Commande & Réception** avec zones d'estampille et signatures.
- **Bulletins de Paie** conformes à la réglementation du travail au Bénin.

---

## 📞 Support & Maintenance
- Marché : Bénin & Afrique de l'Ouest
- Devise par défaut : **FCFA (XOF)** (Support multi-devises EUR et USD inclus)
- Abonnement SaaS : 5.000 FCFA / mois / secteur
