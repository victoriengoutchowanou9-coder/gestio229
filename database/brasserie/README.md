# SOUS-LOGICIEL : BRASSERIE & DÉPÔT DE BOISSONS
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Brasserie & Dépôt de Boissons** (`brasserie`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Casiers consignés (pleins/vides), tournées et grossistes.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `brasserie`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
