export type StatutBC = 
  | 'En attente Signature Gestionnaire'
  | 'En attente Signature Directeur'
  | 'Validé'
  | 'Réceptionné'
  | 'Rejeté';

export type RoleSignature = 'gestionnaire' | 'directeur' | 'magasinier';

export interface Fournisseur {
  id: string;
  code: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface Produit {
  id: string;
  code: string;
  name: string;
  category?: string;
  ucd: string; // Unité de Conditionnement (Carton, Casier, Sac, etc.)
  uv: string;  // Unité de Vente (Kg, Bouteille, etc.)
  coef: number; // Nombre d'UV par UCD
  stockMagasin: number; // En UCD
  stockVente: number;   // En UV
  priceAchatUcd: number;
  priceVenteUcd: number;
  priceVenteUv: number;
}

export interface BcLigne {
  id?: string;
  bc_id?: string;
  produit_id: string;
  code_produit: string;
  nom_produit: string;
  ucd: string; // Toujours en UCD (Règle B.1)
  stock_actuel_ucd: number;
  qte_commande: number;
  qte_recue: number;
  pu_ttc: number;
  total_ligne: number;
}

export interface SignatureBC {
  id?: string;
  bc_id: string;
  role: RoleSignature;
  signer_name: string;
  signature_image_base64: string;
  date_signature: string;
}

export interface BonCommande {
  id: string;
  reference: string; // Format: BC-YYYY-NNN
  fournisseur_id: string;
  fournisseur_nom: string;
  date_commande: string;
  date_livraison_prevue?: string;
  statut: StatutBC;
  total_ttc: number;
  notes?: string;
  created_by?: string;
  created_at: string;
  lignes: BcLigne[];
  signatures: {
    gestionnaire?: SignatureBC;
    directeur?: SignatureBC;
    magasinier?: SignatureBC;
  };
}
