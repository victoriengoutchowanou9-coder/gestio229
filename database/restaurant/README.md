# SOUS-LOGICIEL : BAR, RESTAURANT, MAQUIS & FAST FOOD
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Bar, Restaurant, Maquis & Fast Food** (`restaurant`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : CHR, gestion des tables, commandes cuisine, menus et boissons.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `restaurant`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
