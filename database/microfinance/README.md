# SOUS-LOGICIEL : MICROFINANCE & TONTINE
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Microfinance & Tontine** (`microfinance`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Carnets de tontine, cotisations journalières, épargne et micro-crédits.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `microfinance`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
