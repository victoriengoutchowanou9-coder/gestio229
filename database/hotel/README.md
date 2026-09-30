# SOUS-LOGICIEL : HÔTEL, RÉSIDENCE & AUBERGE
## Espace de Migrations Indépendantes

> **Règle absolue GESTIO 229 :**  
> Ce répertoire contient **exclusivement** les migrations et règles métier du sous-logiciel **Hôtel, Résidence & Auberge** (`hotel`).  
> Une modification ici n'impacte en aucun cas les autres sous-logiciels.

### Données & Périmètre Métier :
- **Description** : Chambres, réservations, nuitées, check-in/out et facturation hébergement.
- **Clé d'isolation logique obligatoire** : `company_id` + `sector_slug` (ou schéma dédié `hotel`)
- **Indépendance** : Données 100% isolées par entreprise et par sous-logiciel.
