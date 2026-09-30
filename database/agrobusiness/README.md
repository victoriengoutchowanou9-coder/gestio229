# SOUS-LOGICIEL : AGRO-BUSINESS & ÉLEVAGE
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Agro-Business & Élevage** (`agrobusiness`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Production agricole, intrants, provendes, cheptel et récoltes.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `agrobusiness`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
