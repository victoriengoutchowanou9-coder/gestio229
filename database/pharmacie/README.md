# SOUS-LOGICIEL : PHARMACIE & DÉPÔT MÉDICAL
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Pharmacie & Dépôt Médical** (`pharmacie`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Ordonnances, numéros de lot, dates de péremption et tiers-payant.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `pharmacie`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
