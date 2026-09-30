# SOUS-LOGICIEL : GESTION LOCATIVE & IMMOBILIER
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Gestion Locative & Immobilier** (`immobilier`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Baux locatifs, biens, quittances de loyer et suivi des impayés.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `immobilier`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
