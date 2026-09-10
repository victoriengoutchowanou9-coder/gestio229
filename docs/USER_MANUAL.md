# MANUEL D'UTILISATION - GESTIO 229 ERP
## Version Entreprise V3.0 • Standard Bénin & UEMOA

---

## Sommaire
1. [Introduction et Prise en Main](#1-introduction-et-prise-en-main)
2. [Module 1 : Ventes, Caisse POS et Créances](#2-module-1--ventes-caisse-pos-et-créances)
3. [Module 2 : Double Stock et Inventaires Physiques](#3-module-2--double-stock-et-inventaires-physiques)
4. [Module 3 : Cycle d'Achat Fournisseurs (BC / BL / Factures)](#4-module-3--cycle-dachat-fournisseurs-bc--bl--factures)
5. [Module 4 : Trésorerie, Double Caisse et Dépenses](#5-module-4--trésorerie-double-caisse-et-dépenses)
6. [Module 5 : Gestion des Employés et Paie Bénin](#6-module-5--gestion-des-employés-et-paie-bénin)
7. [Module 6 : Comptabilité Automatique SYSCOHADA](#7-module-6--comptabilité-automatique-syscohada)
8. [Module 7 : Tableaux de Bord et Signature Électronique](#8-module-7--tableaux-de-bord-et-signature-électronique)
9. [Module 8 : Choix du Secteur d'Activité et Paramètres Fiscaux](#9-module-8--choix-du-secteur-dactivité-et-paramètres-fiscaux)

---

## 1. Introduction et Prise en Main
GESTIO 229 ERP a été conçu pour fonctionner sans interruption, même en cas de coupure de connexion internet. Toutes les données sont enregistrées en temps réel sur votre terminal et se synchronisent automatiquement dès le retour du réseau.

### Pour démarrer :
1. Double-cliquez sur `LANCER_GESTIO229.bat`.
2. L'application s'ouvre dans votre navigateur par défaut.
3. Vérifiez dans le bandeau supérieur que le statut indique **100% Hors-ligne / Sync**.

---

## 2. Module 1 : Ventes, Caisse POS et Créances

### Réaliser une vente au comptant :
1. Dans l'onglet **1. Vente & POS**, cliquez sur les articles ou scannez leurs codes-barres avec votre douchette.
2. Modifiez la quantité directement dans le panier si nécessaire.
3. Cliquez sur **ENCAISSER [ESPACE]**.
4. Sélectionnez le moyen de paiement (ou répartissez entre Espèces, MTN MoMo, Moov Money et Wave).
5. Choisissez le format d'impression souhaité : **Ticket 80mm** ou **Facture A4 Normalisée**.

### Réaliser une vente à crédit :
1. Sélectionnez obligatoirement un **Client identifié** (Nom, IFU, Téléphone).
2. Dans la fenêtre de paiement, renseignez le montant dans la case **⏳ Vente à Crédit**.
3. La créance est immédiatement rattachée à la fiche du client avec son échéance de paiement.
4. Utilisez le bouton **Relance WhatsApp** pour notifier le client d'un simple clic.

### Facture d'Avoir (Annulation / Retour) :
- Accédez au sous-onglet **Factures d'Avoir**.
- Renseignez le numéro de facture initiale et le motif. Le stock est automatiquement réintégré et le chiffre d'affaires ajusté selon la norme E-MECEF.

---

## 3. Module 2 : Double Stock et Inventaires Physiques

### Comprendre le Double Stock :
- **Stock Magasin (Réserve)** : Entrepôt où sont réceptionnées les marchandises commandées aux fournisseurs.
- **Stock Vente (Rayon POS)** : Emplacement direct du point de vente dans lequel la caisse puise pour les ventes.

### Transférer du stock du Magasin vers le Rayon :
1. Dans l'onglet **2. Gestion des Stocks**, cliquez sur **Transférer**.
2. Indiquez la quantité à transférer.
3. Le stock magasin diminue et le stock vente augmente instantanément avec traçabilité dans le journal des transferts.

### Faire un inventaire physique :
1. Accédez à l'onglet **Inventaire Physique & Écarts**.
2. Imprimez la fiche de comptage vierge.
3. Saisissez les quantités comptées dans la colonne **Stock Physique**.
4. L'application calcule automatiquement les écarts en quantité et en valeur FCFA.
5. Cliquez sur **Valider & Ajuster le Stock** pour enregistrer les corrections.

---

## 4. Module 3 : Cycle d'Achat Fournisseurs (BC / BL / Factures)

1. **Bon de Commande (BC)** : Créez la commande avec les articles, quantités et prix convenus. Apposez la double signature électronique (Magasinier + Gérant).
2. **Réception & Bon de Livraison (BL)** : À la livraison, contrôlez la quantité livrée par rapport à la commande. La validation incrémente automatiquement le **Stock Magasin**.
3. **Facture Fournisseur** : Suivez les échéances de paiement des fournisseurs pour éviter tout retard d'approvisionnement.

---

## 5. Module 4 : Trésorerie, Double Caisse et Dépenses

### Gestion de la caisse journalière :
- La caisse sépare distinctement les **Espèces** et les encaissements **Mobile Money**.
- Pour verser l'excédent de caisse au coffre ou à la banque, cliquez sur **Demande de Versement Caissière ➔ Trésorerie**.
- En fin de journée, cliquez sur **Clôture Caisse** pour éditer le rapport de fermeture journalier.

### Enregistrer une dépense :
- Cliquez sur **+ Enregistrer une Dépense**.
- Renseignez la catégorie (Électricité SBEE, Eau SONEB, Carburant, Fournitures...) et le montant. Le solde de la caisse est immédiatement débité.

---

## 6. Module 5 : Gestion des Employés et Paie Bénin

- Créez les fiches du personnel avec le numéro CNSS et le salaire de base.
- Chaque fin de mois, le module calcule automatiquement :
  - La cotisation CNSS salariale (3.6%)
  - L'impôt sur traitements et salaires (IPTS Bénin)
  - Le Net à Payer
- Imprimez directement les bulletins de salaire conformes au droit du travail béninois.

---

## 7. Module 6 : Comptabilité Automatique SYSCOHADA

Vous n'avez pas besoin d'être comptable pour tenir vos livres :
- Chaque vente génère automatiquement une écriture dans le journal **VT** (Débit 411/571, Crédit 701, Crédit 4431 TVA 18%).
- Chaque achat génère une écriture dans le journal **AC** (Débit 601, Débit 4451 TVA, Crédit 401).
- Consultez en temps réel la **Balance Générale**, le **Bilan** et le **Compte de Résultat**.

---

## 8. Module 7 : Tableaux de Bord et Signature Électronique

- Visualisez l'évolution de votre Chiffre d'Affaires, de votre Marge Brute et Marge Nette.
- Identifiez vos 5 articles les plus rentables.
- Utilisez le pavé de signature intégré pour signer les documents contractuels sur écran tactile.

---

## 9. Module 8 : Choix du Secteur d'Activité et Paramètres Fiscaux

GESTIO 229 s'adapte à votre métier en un clic parmi les 8 secteurs disponibles :
1. **Boutique & Prêt-à-porter**
2. **Restaurant, Maquis & Bar**
3. **Pharmacie & Dépôt**
4. **Quincaillerie & Matériaux de construction**
5. **Hôtel & Résidences**
6. **Station-Service**
7. **Cabinet de Prestations & Conseil**
8. **École & Centre de formation**

Renseignez votre **NIF / IFU à 13 chiffres**, votre **RCCM** et votre adresse pour que tous vos devis et factures soient conformes aux exigences de la DGI Bénin.
