# SOUS-LOGICIEL : IMPRIMERIE & SÉRIGRAPHIE
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Imprimerie & Sérigraphie** (`imprimerie`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Devis sur mesure, calcul BAT, tirages offset/numérique et façonnage.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `imprimerie`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
