# SOUS-LOGICIEL : POISSONNERIE & PRODUITS FRAIS
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Poissonnerie & Produits Frais** (`poissonnerie`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Chambres froides, poissons, volailles, viandes congelées, pesées et cartons.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `poissonnerie`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
