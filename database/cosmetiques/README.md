# SOUS-LOGICIEL : COSMÉTIQUES & SALONS DE BEAUTÉ
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Cosmétiques & Salons de Beauté** (`cosmetiques`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Soins, coiffure, esthétique, forfaits et produits de beauté.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `cosmetiques`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
