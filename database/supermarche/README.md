# SOUS-LOGICIEL : SUPERMARCHÉ & SUPÉRETTE
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Supermarché & Supérette** (`supermarche`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Rayons, gondoles, codes-barres rapide, DLC courtes.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `supermarche`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
