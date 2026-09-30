# SOUS-LOGICIEL : MERCERIE & COUTURE
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Mercerie & Couture** (`mercerie`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Tissus au mètre, boutons, fermetures, commandes sur-mesure et retouches.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `mercerie`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
