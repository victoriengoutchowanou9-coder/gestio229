# SOUS-LOGICIEL : TRANSPORT & LOGISTIQUE
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Transport & Logistique** (`transport`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Flotte de véhicules, chauffeurs, bordereaux de livraison et fret.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `transport`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
