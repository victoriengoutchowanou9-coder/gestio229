# SOUS-LOGICIEL : ÉCOLE & CENTRE DE FORMATION
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **École & Centre de Formation** (`ecole`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Classes, élèves, frais de scolarité, tranches et reçus officiels.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `ecole`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
