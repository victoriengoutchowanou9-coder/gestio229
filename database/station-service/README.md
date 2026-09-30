# SOUS-LOGICIEL : STATION-SERVICE & HYDROCARBURES
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Station-Service & Hydrocarbures** (`station-service`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Cuves, pompes, compteurs, quarts pompistes, carburants et lubrifiants.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `station-service`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
