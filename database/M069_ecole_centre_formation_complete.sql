-- =============================================================================
-- GESTIO 229 SaaS — Migration M069 : Secteur École & Centre de Formation
-- Triple Expérience Métier Spécialisée :
-- 1. Établissement Scolaire (Maternelle, Primaire, Collège, Lycée)
-- 2. Centre de Formation Professionnelle & Continue (Modules, Sessions, Certificats)
-- 3. Établissement Mixte (Double cursus Scolaire & Formations Certifiantes)
-- =============================================================================

-- 0. Configuration persistante du type d'établissement au niveau de la compagnie
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS ecole_type_etablissement VARCHAR(30) DEFAULT 'SCOLAIRE';

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. STRUCTURE ACADÉMIQUE, PÉRIODES & NIVEAUX
-- ══════════════════════════════════════════════════════════════════════════════

-- Années Académiques / Scolaires
CREATE TABLE IF NOT EXISTS public.ecole_annees_scolaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    libelle VARCHAR(50) NOT NULL, -- Ex: 2025-2026
    date_debut DATE NOT NULL,
    date_fin DATE NOT NULL,
    est_active BOOLEAN DEFAULT false,
    statut VARCHAR(30) DEFAULT 'EN_COURS', -- PREPARATION, EN_COURS, CLOTUREE
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_annees_comp ON public.ecole_annees_scolaires(company_id, est_active);

-- Périodes (Trimestres, Semestres ou Sessions intensives)
CREATE TABLE IF NOT EXISTS public.ecole_periodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    annee_id UUID REFERENCES public.ecole_annees_scolaires(id) ON DELETE CASCADE,
    nom VARCHAR(100) NOT NULL, -- Trimestre 1, Semestre 2, Session Mars
    type_periode VARCHAR(30) DEFAULT 'TRIMESTRE', -- TRIMESTRE, SEMESTRE, SESSION
    date_debut DATE,
    date_fin DATE,
    ordre INTEGER DEFAULT 1,
    est_cloturee BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_periodes_comp ON public.ecole_periodes(company_id, annee_id);

-- Niveaux / Cycles / Filières d'enseignement
CREATE TABLE IF NOT EXISTS public.ecole_niveaux_filieres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    nom VARCHAR(150) NOT NULL, -- Ex: 6ème, Terminale D, Dév Web Fullstack
    cycle VARCHAR(50) DEFAULT 'SECONDAIRE', -- MATERNELLE, PRIMAIRE, COLLEGE, LYCEE, SUPERIEUR, FORMATION_PRO
    frais_inscription_base NUMERIC(12, 2) DEFAULT 0,
    frais_scolarite_base NUMERIC(12, 2) DEFAULT 0,
    description TEXT,
    statut VARCHAR(30) DEFAULT 'ACTIF',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_niveaux_comp ON public.ecole_niveaux_filieres(company_id, code);

-- Salles de cours, Laboratoires et Ateliers
CREATE TABLE IF NOT EXISTS public.ecole_salles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    nom VARCHAR(100) NOT NULL,
    capacite INTEGER DEFAULT 35,
    type_salle VARCHAR(50) DEFAULT 'COURS', -- COURS, TP_INFORMATIQUE, LABO, ATELIER, AMPHI
    batiment VARCHAR(100),
    equipements JSONB DEFAULT '[]'::jsonb,
    statut VARCHAR(30) DEFAULT 'DISPONIBLE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_salles_comp ON public.ecole_salles(company_id);

-- Classes et Groupes d'apprenants
CREATE TABLE IF NOT EXISTS public.ecole_classes_groupes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    annee_id UUID REFERENCES public.ecole_annees_scolaires(id) ON DELETE SET NULL,
    niveau_filiere_id UUID REFERENCES public.ecole_niveaux_filieres(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    nom VARCHAR(100) NOT NULL, -- Ex: 6ème A, Tle D1, Promo Dev 2026
    capacite_max INTEGER DEFAULT 40,
    salle_principale VARCHAR(100),
    professeur_principal_nom VARCHAR(150),
    statut VARCHAR(30) DEFAULT 'ACTIF',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_classes_comp ON public.ecole_classes_groupes(company_id, annee_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. PARENTS, ÉLÈVES & IDENTIFIANTS UNIQUES SÉCURISÉS
-- ══════════════════════════════════════════════════════════════════════════════

-- Responsables & Parents d'élèves (Notifications WhatsApp & Facturation)
CREATE TABLE IF NOT EXISTS public.ecole_responsables_parents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nom_complet VARCHAR(200) NOT NULL,
    lien_parente VARCHAR(50) DEFAULT 'Père', -- Père, Mère, Tuteur, Entreprise Sponsor
    telephone VARCHAR(50) NOT NULL,
    telephone_secondaire VARCHAR(50),
    email VARCHAR(150),
    whatsapp VARCHAR(50),
    profession VARCHAR(100),
    adresse TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_parents_comp ON public.ecole_responsables_parents(company_id, telephone);

-- Élèves & Apprenants
-- Identifiant unique généré type: 202600125KFA (année + séquence + suffixe aléatoire de 3 lettres)
CREATE TABLE IF NOT EXISTS public.ecole_eleves_apprenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    matricule VARCHAR(50) NOT NULL,
    identifiant_national_unique VARCHAR(60), -- Ex: 202600125KFA
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    sexe VARCHAR(10) DEFAULT 'M', -- M, F
    date_naissance DATE,
    lieu_naissance VARCHAR(150),
    nationalite VARCHAR(100) DEFAULT 'Béninoise',
    adresse TEXT,
    classe_actuelle_id UUID REFERENCES public.ecole_classes_groupes(id) ON DELETE SET NULL,
    classe_nom VARCHAR(100),
    responsable_id UUID REFERENCES public.ecole_responsables_parents(id) ON DELETE SET NULL,
    responsable_nom VARCHAR(200),
    responsable_contact VARCHAR(100),
    responsable_email VARCHAR(150),
    photo_url TEXT,
    documents_fournis JSONB DEFAULT '[]'::jsonb,
    statut VARCHAR(30) DEFAULT 'ACTIF', -- ACTIF, SUSPENDU, SORTI, DIPLOME, TRANSFERE
    type_profil VARCHAR(30) DEFAULT 'ELEVE', -- ELEVE, APPRENANT, STAGIAIRE
    frais_scolarite_total NUMERIC(12, 2) DEFAULT 0,
    frais_scolarite_paye NUMERIC(12, 2) DEFAULT 0,
    date_inscription DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_eleves_comp_mat ON public.ecole_eleves_apprenants(company_id, matricule);
CREATE INDEX IF NOT EXISTS idx_ecole_eleves_comp_classe ON public.ecole_eleves_apprenants(company_id, classe_actuelle_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. CORPS ENSEIGNANT, MATIÈRES & EMPLOI DU TEMPS
-- ══════════════════════════════════════════════════════════════════════════════

-- Enseignants & Formateurs
CREATE TABLE IF NOT EXISTS public.ecole_enseignants_formateurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    matricule VARCHAR(50),
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    specialite VARCHAR(150),
    grade_titre VARCHAR(100) DEFAULT 'Enseignant', -- Certifié, Agrégé, Vacataire, Formateur Pro
    telephone VARCHAR(50),
    email VARCHAR(150),
    taux_horaire NUMERIC(10, 2) DEFAULT 0,
    type_contrat VARCHAR(50) DEFAULT 'PERMANENT', -- PERMANENT, VACATAIRE, PRESTATAIRE
    statut VARCHAR(30) DEFAULT 'ACTIF',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_profs_comp ON public.ecole_enseignants_formateurs(company_id);

-- Matières & Modules d'apprentissage
CREATE TABLE IF NOT EXISTS public.ecole_matieres_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    nom VARCHAR(150) NOT NULL,
    description TEXT,
    type VARCHAR(30) DEFAULT 'ACADEMIQUE', -- ACADEMIQUE, PROFESSIONNEL, PRATIQUE, LANGUE
    statut VARCHAR(30) DEFAULT 'ACTIF',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_matieres_comp ON public.ecole_matieres_modules(company_id, code);

-- Affectations Pédagogiques (Matière affectée à une Classe avec un Enseignant et Coefficient)
CREATE TABLE IF NOT EXISTS public.ecole_affectations_pedagogiques (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    annee_id UUID REFERENCES public.ecole_annees_scolaires(id) ON DELETE CASCADE,
    classe_id UUID NOT NULL REFERENCES public.ecole_classes_groupes(id) ON DELETE CASCADE,
    matiere_id UUID NOT NULL REFERENCES public.ecole_matieres_modules(id) ON DELETE CASCADE,
    enseignant_id UUID REFERENCES public.ecole_enseignants_formateurs(id) ON DELETE SET NULL,
    coefficient NUMERIC(4, 2) DEFAULT 1.0,
    heures_hebdo NUMERIC(4, 1) DEFAULT 2.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_affect_comp ON public.ecole_affectations_pedagogiques(company_id, classe_id);

-- Emplois du Temps (Avec détection de conflits Salle / Enseignant)
CREATE TABLE IF NOT EXISTS public.ecole_emplois_du_temps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    annee_id UUID REFERENCES public.ecole_annees_scolaires(id) ON DELETE CASCADE,
    classe_id UUID NOT NULL REFERENCES public.ecole_classes_groupes(id) ON DELETE CASCADE,
    matiere_id UUID NOT NULL REFERENCES public.ecole_matieres_modules(id) ON DELETE CASCADE,
    enseignant_id UUID REFERENCES public.ecole_enseignants_formateurs(id) ON DELETE SET NULL,
    salle_id UUID REFERENCES public.ecole_salles(id) ON DELETE SET NULL,
    jour_semaine VARCHAR(20) NOT NULL, -- LUNDI, MARDI, MERCREDI, JEUDI, VENDREDI, SAMEDI
    heure_debut TIME NOT NULL,
    heure_fin TIME NOT NULL,
    couleur VARCHAR(30) DEFAULT '#3b82f6',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_edt_comp ON public.ecole_emplois_du_temps(company_id, classe_id, jour_semaine);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. ÉVALUATIONS, NOTES & BULLETINS DE PERFORMANCE
-- ══════════════════════════════════════════════════════════════════════════════

-- Évaluations (Devoirs, Interrogations, Examens, TP)
CREATE TABLE IF NOT EXISTS public.ecole_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    annee_id UUID REFERENCES public.ecole_annees_scolaires(id) ON DELETE CASCADE,
    periode_id UUID REFERENCES public.ecole_periodes(id) ON DELETE SET NULL,
    classe_id UUID NOT NULL REFERENCES public.ecole_classes_groupes(id) ON DELETE CASCADE,
    matiere_id UUID NOT NULL REFERENCES public.ecole_matieres_modules(id) ON DELETE CASCADE,
    enseignant_id UUID REFERENCES public.ecole_enseignants_formateurs(id) ON DELETE SET NULL,
    titre VARCHAR(150) NOT NULL,
    type_evaluation VARCHAR(40) DEFAULT 'DEVOIR', -- INTERRO, DEVOIR, EXAMEN_BLANC, TP_PRO, RATTRAPAGE
    coefficient NUMERIC(4, 2) DEFAULT 1.0,
    note_sur NUMERIC(6, 2) DEFAULT 20.0,
    date_evaluation DATE DEFAULT CURRENT_DATE,
    est_publiee BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_eval_comp ON public.ecole_evaluations(company_id, classe_id, periode_id);

-- Notes individuelles des élèves
CREATE TABLE IF NOT EXISTS public.ecole_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    evaluation_id UUID NOT NULL REFERENCES public.ecole_evaluations(id) ON DELETE CASCADE,
    eleve_id UUID NOT NULL REFERENCES public.ecole_eleves_apprenants(id) ON DELETE CASCADE,
    note NUMERIC(6, 2) NOT NULL,
    note_sur NUMERIC(6, 2) DEFAULT 20.0,
    appreciation VARCHAR(200),
    statut_presence VARCHAR(20) DEFAULT 'PRESENT', -- PRESENT, ABSENT, ABSENT_JUSTIFIE
    saisie_par VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(evaluation_id, eleve_id)
);
CREATE INDEX IF NOT EXISTS idx_ecole_notes_comp ON public.ecole_notes(company_id, eleve_id);

-- Bulletins de Notes Périodiques / Annuels
CREATE TABLE IF NOT EXISTS public.ecole_bulletins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    annee_id UUID REFERENCES public.ecole_annees_scolaires(id) ON DELETE CASCADE,
    periode_id UUID REFERENCES public.ecole_periodes(id) ON DELETE CASCADE,
    classe_id UUID NOT NULL REFERENCES public.ecole_classes_groupes(id) ON DELETE CASCADE,
    eleve_id UUID NOT NULL REFERENCES public.ecole_eleves_apprenants(id) ON DELETE CASCADE,
    moyenne_generale NUMERIC(5, 2) NOT NULL,
    rang INTEGER,
    effectif_classe INTEGER,
    moyenne_classe_min NUMERIC(5, 2),
    moyenne_classe_max NUMERIC(5, 2),
    moyenne_classe_avg NUMERIC(5, 2),
    total_coefficients NUMERIC(6, 2),
    total_points NUMERIC(8, 2),
    appreciation_globale TEXT,
    decision_conseil VARCHAR(100), -- Tableau d'honneur, Félicitations, Encouragements, Avertissement travail
    lignes_details JSONB DEFAULT '[]'::jsonb, -- Détail par matière
    date_generation TIMESTAMPTZ DEFAULT NOW(),
    est_verrouille BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_bulletins_comp ON public.ecole_bulletins(company_id, eleve_id, periode_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. ASSIDUITÉ, APPEL JOURNALIER & DISCIPLINE
-- ══════════════════════════════════════════════════════════════════════════════

-- Absences & Retards (Appel par classe / séance)
CREATE TABLE IF NOT EXISTS public.ecole_absences_retards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    annee_id UUID REFERENCES public.ecole_annees_scolaires(id) ON DELETE SET NULL,
    eleve_id UUID NOT NULL REFERENCES public.ecole_eleves_apprenants(id) ON DELETE CASCADE,
    classe_id UUID REFERENCES public.ecole_classes_groupes(id) ON DELETE SET NULL,
    date_evenement DATE NOT NULL DEFAULT CURRENT_DATE,
    type VARCHAR(30) DEFAULT 'ABSENCE', -- ABSENCE, RETARD
    creneau VARCHAR(50), -- Matin, Soir, ou Heure spécifique
    duree_minutes INTEGER DEFAULT 60,
    motif TEXT,
    est_justifie BOOLEAN DEFAULT false,
    justificatif_description TEXT,
    justificatif_url TEXT,
    saisie_par VARCHAR(150),
    notifie_parent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_abs_comp ON public.ecole_absences_retards(company_id, eleve_id, date_evenement);

-- Discipline & Sanctions
CREATE TABLE IF NOT EXISTS public.ecole_observations_discipline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    annee_id UUID REFERENCES public.ecole_annees_scolaires(id) ON DELETE SET NULL,
    eleve_id UUID NOT NULL REFERENCES public.ecole_eleves_apprenants(id) ON DELETE CASCADE,
    date_incident DATE DEFAULT CURRENT_DATE,
    motif TEXT NOT NULL,
    gravite VARCHAR(30) DEFAULT 'MINEURE', -- MINEURE, MOYENNE, GRAVE
    sanction VARCHAR(50) DEFAULT 'AVERTISSEMENT', -- AVERTISSEMENT, BLAME, RETENUE, EXCLUSION_TEMP, EXCLUSION_DEF
    duree_jours INTEGER DEFAULT 0,
    statut VARCHAR(30) DEFAULT 'ACTIF', -- ACTIF, LEVEE, EFFECTUEE
    saisie_par VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_disc_comp ON public.ecole_observations_discipline(company_id, eleve_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. GESTION FINANCIÈRE, ÉCHÉANCIERS, ENCAISSEMENTS & RELANCES
-- ══════════════════════════════════════════════════════════════════════════════

-- Grille Tarifaire / Frais Scolaires
CREATE TABLE IF NOT EXISTS public.ecole_frais_scolarite (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    annee_id UUID REFERENCES public.ecole_annees_scolaires(id) ON DELETE CASCADE,
    niveau_filiere_id UUID REFERENCES public.ecole_niveaux_filieres(id) ON DELETE SET NULL,
    intitule VARCHAR(150) NOT NULL, -- Inscription, Scolarité Tranche 1, Tenue, Cantine
    type_frais VARCHAR(50) DEFAULT 'SCOLARITE', -- INSCRIPTION, SCOLARITE, EXAMEN, TENUE, CANTINE, TRANSPORT, ASSURANCE
    montant NUMERIC(12, 2) NOT NULL,
    date_limite DATE,
    obligatoire BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_tarifs_comp ON public.ecole_frais_scolarite(company_id, annee_id);

-- Échéanciers individuels de paiement par élève
CREATE TABLE IF NOT EXISTS public.ecole_echeanciers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    annee_id UUID REFERENCES public.ecole_annees_scolaires(id) ON DELETE CASCADE,
    eleve_id UUID NOT NULL REFERENCES public.ecole_eleves_apprenants(id) ON DELETE CASCADE,
    intitule_echeance VARCHAR(150) NOT NULL, -- Ex: Tranche 1 (Octobre), Tranche 2 (Janvier)
    date_echeance DATE NOT NULL,
    montant_du NUMERIC(12, 2) NOT NULL,
    montant_paye NUMERIC(12, 2) DEFAULT 0,
    solde_restant NUMERIC(12, 2) NOT NULL,
    statut VARCHAR(30) DEFAULT 'IMPAYE', -- IMPAYE, PARTIEL, SOLDE, EN_RETARD
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_ech_comp ON public.ecole_echeanciers(company_id, eleve_id, statut);

-- Reçus & Encaissements de Paiements
CREATE TABLE IF NOT EXISTS public.ecole_paiements_recus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_recu VARCHAR(50) NOT NULL, -- Ex: REC-2026-0001
    eleve_id UUID NOT NULL REFERENCES public.ecole_eleves_apprenants(id) ON DELETE CASCADE,
    echeancier_id UUID REFERENCES public.ecole_echeanciers(id) ON DELETE SET NULL,
    montant NUMERIC(12, 2) NOT NULL,
    mode_paiement VARCHAR(50) DEFAULT 'ESPECES', -- ESPECES, VIREMENT, CARTE, MOMO_MTN, MOMO_MOOV, CHEQUE
    reference_transaction VARCHAR(100),
    date_paiement TIMESTAMPTZ DEFAULT NOW(),
    encaisse_par VARCHAR(150),
    observations TEXT,
    imprime_fois INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_paie_comp ON public.ecole_paiements_recus(company_id, numero_recu);
CREATE INDEX IF NOT EXISTS idx_ecole_paie_eleve ON public.ecole_paiements_recus(company_id, eleve_id);

-- Historique des Relances de Paiement (WhatsApp, SMS, etc.)
CREATE TABLE IF NOT EXISTS public.ecole_relances_historique (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    eleve_id UUID REFERENCES public.ecole_eleves_apprenants(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.ecole_responsables_parents(id) ON DELETE SET NULL,
    echeancier_id UUID REFERENCES public.ecole_echeanciers(id) ON DELETE SET NULL,
    canal VARCHAR(30) DEFAULT 'WHATSAPP', -- WHATSAPP, SMS, EMAIL
    telephone_destinataire VARCHAR(50) NOT NULL,
    montant_rappele NUMERIC(12, 2) DEFAULT 0,
    message_envoye TEXT NOT NULL,
    date_envoi TIMESTAMPTZ DEFAULT NOW(),
    statut VARCHAR(30) DEFAULT 'ENVOYE',
    envoye_par VARCHAR(150)
);
CREATE INDEX IF NOT EXISTS idx_ecole_relances_comp ON public.ecole_relances_historique(company_id, eleve_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. MODULE CENTRE DE FORMATION PRO & CERTIFICATIONS
-- ══════════════════════════════════════════════════════════════════════════════

-- Catalogue des Formations Professionnelles
CREATE TABLE IF NOT EXISTS public.ecole_formations_catalogue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    titre VARCHAR(200) NOT NULL,
    domaine VARCHAR(100), -- Informatique, Gestion, BTP, Cuisine, Langues
    description TEXT,
    niveau_requis VARCHAR(100) DEFAULT 'Tous niveaux',
    duree_heures INTEGER DEFAULT 40,
    tarif_ht NUMERIC(12, 2) DEFAULT 0,
    objectifs JSONB DEFAULT '[]'::jsonb,
    prerequis JSONB DEFAULT '[]'::jsonb,
    programme JSONB DEFAULT '[]'::jsonb,
    est_certifiante BOOLEAN DEFAULT true,
    statut VARCHAR(30) DEFAULT 'ACTIF',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_form_comp ON public.ecole_formations_catalogue(company_id, code);

-- Sessions de Formation (Calendrier des sessions planifiées)
CREATE TABLE IF NOT EXISTS public.ecole_sessions_formation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    formation_id UUID NOT NULL REFERENCES public.ecole_formations_catalogue(id) ON DELETE CASCADE,
    code_session VARCHAR(50) NOT NULL,
    intitule VARCHAR(200) NOT NULL,
    formateur_principal_id UUID REFERENCES public.ecole_enseignants_formateurs(id) ON DELETE SET NULL,
    date_debut DATE NOT NULL,
    date_fin DATE NOT NULL,
    capacite_max INTEGER DEFAULT 20,
    lieu_ou_lien VARCHAR(255) DEFAULT 'Salle Informatique 1',
    statut VARCHAR(30) DEFAULT 'PLANIFIEE', -- PLANIFIEE, EN_COURS, TERMINEE, ANNULEE
    inscrits_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_sess_comp ON public.ecole_sessions_formation(company_id, formation_id);

-- Attestations & Certificats avec QR-Code / Numéro Unique de Vérification
CREATE TABLE IF NOT EXISTS public.ecole_attestations_certificats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_certificat VARCHAR(60) NOT NULL, -- Ex: CERT-2026-DEV-0089
    eleve_apprenant_id UUID NOT NULL REFERENCES public.ecole_eleves_apprenants(id) ON DELETE CASCADE,
    formation_id UUID REFERENCES public.ecole_formations_catalogue(id) ON DELETE SET NULL,
    session_id UUID REFERENCES public.ecole_sessions_formation(id) ON DELETE SET NULL,
    type_document VARCHAR(50) DEFAULT 'CERTIFICAT_REUSSITE', -- ATTESTATION_SUIVI, CERTIFICAT_REUSSITE, DIPLOME
    mention VARCHAR(50) DEFAULT 'Bien', -- Passable, Assez Bien, Bien, Très Bien, Excellent
    date_obtention DATE DEFAULT CURRENT_DATE,
    hash_verification VARCHAR(100),
    valide_par VARCHAR(150),
    observations TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_cert_comp ON public.ecole_attestations_certificats(company_id, numero_certificat);

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. BIBLIOTHÈQUE, DÉPÔT DOCUMENTAIRE & PRÊTS
-- ══════════════════════════════════════════════════════════════════════════════

-- Bibliothèque & Documents (Cours, épreuves avec workflow)
CREATE TABLE IF NOT EXISTS public.ecole_bibliotheque_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    titre VARCHAR(255) NOT NULL,
    type_ressource VARCHAR(50) DEFAULT 'SUPPORT_COURS', -- LIVRE, SUPPORT_COURS, EPREUVE, CORRIGE, MANUEL
    auteur VARCHAR(150),
    annee_edition INTEGER,
    matiere_module_id UUID REFERENCES public.ecole_matieres_modules(id) ON DELETE SET NULL,
    filiere_id UUID REFERENCES public.ecole_niveaux_filieres(id) ON DELETE SET NULL,
    statut_workflow VARCHAR(30) DEFAULT 'PUBLIE', -- BROUILLON, SOUMIS, EN_VALIDATION, VALIDE, REFUSE, PUBLIE
    fichier_url TEXT,
    exemplaires_total INTEGER DEFAULT 1,
    exemplaires_disponibles INTEGER DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_biblio_comp ON public.ecole_bibliotheque_documents(company_id, code);

-- Prêts physiques de Livres & Manuels
CREATE TABLE IF NOT EXISTS public.ecole_prets_livres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.ecole_bibliotheque_documents(id) ON DELETE CASCADE,
    emprunteur_type VARCHAR(30) DEFAULT 'ELEVE', -- ELEVE, ENSEIGNANT
    eleve_id UUID REFERENCES public.ecole_eleves_apprenants(id) ON DELETE SET NULL,
    enseignant_id UUID REFERENCES public.ecole_enseignants_formateurs(id) ON DELETE SET NULL,
    emprunteur_nom VARCHAR(200) NOT NULL,
    date_pret DATE DEFAULT CURRENT_DATE,
    date_retour_prevue DATE NOT NULL,
    date_retour_effective DATE,
    statut VARCHAR(30) DEFAULT 'EN_COURS', -- EN_COURS, RENDU, EN_RETARD, PERDU
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecole_prets_comp ON public.ecole_prets_livres(company_id, statut);

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. COMPATIBILITÉ RÉTROACTIVE (VUES OU BRIDGES SI NÉCESSAIRE)
-- ══════════════════════════════════════════════════════════════════════════════

-- Si d'anciennes tables existent (ecole_eleves, ecole_paiements_scolaires), les tables créées ici restent les tables maîtresses
-- On crée des vues de confort si elles n'existent pas encore
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ecole_eleves') THEN
        CREATE VIEW public.ecole_eleves AS
        SELECT 
            id, company_id, nom, prenom, classe_nom AS classe, 
            date_naissance, responsable_contact AS contact_parent, 
            frais_scolarite_total AS montant_frais_annuels, 
            frais_scolarite_paye AS frais_payes, 
            statut, created_at, updated_at
        FROM public.ecole_eleves_apprenants;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ecole_paiements_scolaires') THEN
        CREATE VIEW public.ecole_paiements_scolaires AS
        SELECT 
            p.id, p.company_id, p.numero_recu AS reference,
            concat(e.prenom, ' ', e.nom) AS eleve_nom,
            e.classe_nom AS classe,
            'Scolarité' AS type_frais,
            p.montant,
            p.mode_paiement,
            p.date_paiement::date AS date_paiement,
            p.encaisse_par AS agent_nom,
            p.created_at
        FROM public.ecole_paiements_recus p
        JOIN public.ecole_eleves_apprenants e ON e.id = p.eleve_id;
    END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 10. ACTIVATION DU ROW LEVEL SECURITY (RLS) SANS CASSE
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    tbl text;
    ecole_tables text[] := ARRAY[
        'ecole_annees_scolaires',
        'ecole_periodes',
        'ecole_niveaux_filieres',
        'ecole_classes_groupes',
        'ecole_salles',
        'ecole_responsables_parents',
        'ecole_eleves_apprenants',
        'ecole_enseignants_formateurs',
        'ecole_matieres_modules',
        'ecole_affectations_pedagogiques',
        'ecole_emplois_du_temps',
        'ecole_evaluations',
        'ecole_notes',
        'ecole_bulletins',
        'ecole_absences_retards',
        'ecole_observations_discipline',
        'ecole_frais_scolarite',
        'ecole_echeanciers',
        'ecole_paiements_recus',
        'ecole_relances_historique',
        'ecole_formations_catalogue',
        'ecole_sessions_formation',
        'ecole_attestations_certificats',
        'ecole_bibliotheque_documents',
        'ecole_prets_livres'
    ];
BEGIN
    FOREACH tbl IN ARRAY ecole_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        
        -- Policy authenticated full access
        EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', tbl);
        
        -- Policy service role full access
        EXECUTE format('DROP POLICY IF EXISTS "Allow service role full access" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow service role full access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', tbl);
        
        -- Policy anon full access (pour client frontend Supabase)
        EXECUTE format('DROP POLICY IF EXISTS "Allow anon full access" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow anon full access" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;
