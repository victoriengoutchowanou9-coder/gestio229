# SOUS-LOGICIEL : HUB PLATEFORME MÈRE
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **HUB Plateforme Mère** (`hub`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Gestion centralisée des entreprises, utilisateurs, abonnements et accès aux sous-logiciels.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `hub`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
