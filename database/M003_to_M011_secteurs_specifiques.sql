-- ==============================================================================
-- M003 : STATION-SERVICE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS fuel_pumps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    fuel_type VARCHAR(50) NOT NULL, -- 'sp95' | 'gasoil' | 'super' | 'kerosene'
    tank_id UUID,
    current_index NUMERIC(12,3) DEFAULT 0.000,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fuel_tanks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    fuel_type VARCHAR(50) NOT NULL,
    capacity_liters NUMERIC(12,2) NOT NULL,
    current_volume NUMERIC(12,2) DEFAULT 0.00,
    alert_threshold NUMERIC(12,2) DEFAULT 500.00,
    last_supply_date DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fuel_pumps ADD CONSTRAINT fk_pump_tank
    FOREIGN KEY (tank_id) REFERENCES fuel_tanks(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS fuel_shift_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    pump_id UUID REFERENCES fuel_pumps(id),
    attendant_id UUID REFERENCES user_profiles(id),
    index_start NUMERIC(12,3) NOT NULL,
    index_end NUMERIC(12,3),
    liters_sold NUMERIC(12,3),
    unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    cash_collected NUMERIC(15,2) DEFAULT 0.00,
    momo_collected NUMERIC(15,2) DEFAULT 0.00,
    losses_liters NUMERIC(12,3) DEFAULT 0.000,
    status VARCHAR(50) DEFAULT 'open', -- 'open' | 'closed'
    opened_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_fuel_pumps_company ON fuel_pumps(company_id);
CREATE INDEX IF NOT EXISTS idx_fuel_tanks_company ON fuel_tanks(company_id);
CREATE INDEX IF NOT EXISTS idx_fuel_shifts_company ON fuel_shift_sessions(company_id);

ALTER TABLE fuel_pumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_shift_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_fuel_pumps" ON fuel_pumps
    USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_fuel_tanks" ON fuel_tanks
    USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_fuel_sessions" ON fuel_shift_sessions
    USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());

-- ==============================================================================
-- M004 : ÉCOLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS school_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    level VARCHAR(50), -- 'maternelle' | 'primaire' | 'college' | 'lycee' | 'superieur'
    teacher_id UUID REFERENCES user_profiles(id),
    academic_year VARCHAR(20) NOT NULL,
    max_students INT DEFAULT 50,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    matricule VARCHAR(50) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(10), -- 'M' | 'F'
    class_id UUID REFERENCES school_classes(id) ON DELETE SET NULL,
    enrollment_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(50) DEFAULT 'actif', -- 'actif' | 'transfere' | 'exclu' | 'diplome'
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, matricule)
);

CREATE TABLE IF NOT EXISTS school_guardians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES school_students(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    relationship VARCHAR(50) DEFAULT 'tuteur', -- 'pere' | 'mere' | 'tuteur'
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(150),
    address TEXT,
    is_primary BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS school_fee_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    class_id UUID REFERENCES school_classes(id) ON DELETE SET NULL,
    label VARCHAR(150) NOT NULL, -- "Inscription", "1ère Tranche", "Frais de sport"
    amount NUMERIC(12,2) NOT NULL,
    due_date DATE,
    is_mandatory BOOLEAN DEFAULT true,
    academic_year VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_fee_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES school_students(id),
    fee_schedule_id UUID REFERENCES school_fee_schedules(id) ON DELETE SET NULL,
    receipt_number VARCHAR(50) NOT NULL,
    amount_paid NUMERIC(12,2) NOT NULL,
    balance_due NUMERIC(12,2) DEFAULT 0.00,
    payment_method VARCHAR(50) DEFAULT 'especes',
    paid_at TIMESTAMPTZ DEFAULT now(),
    received_by UUID REFERENCES user_profiles(id),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS school_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    student_id UUID REFERENCES school_students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES school_classes(id),
    subject VARCHAR(100) NOT NULL,
    grade NUMERIC(5,2),
    coefficient NUMERIC(4,2) DEFAULT 1.00,
    exam_type VARCHAR(50) DEFAULT 'composition', -- 'composition' | 'interrogation' | 'examen'
    semester INT DEFAULT 1 CHECK (semester IN (1,2,3)),
    academic_year VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_absences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES school_students(id),
    class_id UUID REFERENCES school_classes(id),
    absence_date DATE NOT NULL DEFAULT CURRENT_DATE,
    subject VARCHAR(100),
    is_justified BOOLEAN DEFAULT false,
    reason TEXT,
    recorded_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_classes_company ON school_classes(company_id);
CREATE INDEX IF NOT EXISTS idx_school_students_company ON school_students(company_id);
CREATE INDEX IF NOT EXISTS idx_school_students_class ON school_students(class_id);
CREATE INDEX IF NOT EXISTS idx_school_fee_payments_company ON school_fee_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_school_grades_student ON school_grades(student_id);

ALTER TABLE school_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_fee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_absences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_school_classes" ON school_classes USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_school_students" ON school_students USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_school_guardians" ON school_guardians USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_school_fee_schedules" ON school_fee_schedules USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_school_fee_payments" ON school_fee_payments USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_school_grades" ON school_grades USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_school_absences" ON school_absences USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());

-- ==============================================================================
-- M005 : PHARMACIE / PARAPHARMACIE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS pharma_drugs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    dci VARCHAR(255),          -- Dénomination Commune Internationale
    family VARCHAR(100),       -- 'antibiotique' | 'antalgique' | 'antiparasitaire' | etc.
    laboratory VARCHAR(150),
    requires_prescription BOOLEAN DEFAULT false,
    min_stock_alert INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pharma_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_number VARCHAR(100) NOT NULL,
    manufacture_date DATE,
    expiry_date DATE NOT NULL,
    quantity_received NUMERIC(12,2) NOT NULL,
    quantity_remaining NUMERIC(12,2) NOT NULL,
    purchase_price NUMERIC(12,2) NOT NULL,
    selling_price NUMERIC(12,2) NOT NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pharma_prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    doctor_name VARCHAR(255),
    doctor_speciality VARCHAR(150),
    prescription_date DATE DEFAULT CURRENT_DATE,
    prescription_image_url TEXT,
    notes TEXT,
    dispensed_at TIMESTAMPTZ,
    dispensed_by UUID REFERENCES user_profiles(id),
    sales_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Vue matérialisée : alertes péremption (rafraîchir avec REFRESH MATERIALIZED VIEW toutes les 24h)
CREATE MATERIALIZED VIEW IF NOT EXISTS pharma_expiry_alerts AS
SELECT
    pb.id,
    pb.company_id,
    p.name AS product_name,
    p.code AS product_code,
    pb.batch_number,
    pb.expiry_date,
    pb.quantity_remaining,
    pb.selling_price,
    CASE
        WHEN pb.expiry_date < CURRENT_DATE THEN 'expired'
        WHEN pb.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'critical'
        WHEN pb.expiry_date < CURRENT_DATE + INTERVAL '90 days' THEN 'warning'
        ELSE 'ok'
    END AS alert_level,
    CURRENT_DATE - pb.expiry_date AS days_past_expiry
FROM pharma_batches pb
JOIN products p ON p.id = pb.product_id
WHERE pb.quantity_remaining > 0
ORDER BY pb.expiry_date ASC;

CREATE INDEX IF NOT EXISTS idx_pharma_expiry_company ON pharma_expiry_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_pharma_batches_company ON pharma_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_pharma_batches_expiry ON pharma_batches(expiry_date);

ALTER TABLE pharma_drugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharma_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharma_prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_pharma_drugs" ON pharma_drugs USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_pharma_batches" ON pharma_batches USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_pharma_prescriptions" ON pharma_prescriptions USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());

-- ==============================================================================
-- M006 : GESTION LOCATIVE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS rental_properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    reference VARCHAR(50) NOT NULL,
    property_type VARCHAR(50) DEFAULT 'immeuble', -- 'appartement' | 'villa' | 'bureau' | 'magasin' | 'studio' | 'immeuble'
    address TEXT NOT NULL,
    city VARCHAR(100) DEFAULT 'Cotonou',
    owner_name VARCHAR(255),
    owner_phone VARCHAR(50),
    total_units INT DEFAULT 1,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rental_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    property_id UUID REFERENCES rental_properties(id) ON DELETE CASCADE,
    unit_number VARCHAR(50) NOT NULL,
    floor INT DEFAULT 0,
    area_sqm NUMERIC(8,2),
    base_rent NUMERIC(12,2) NOT NULL,
    charges NUMERIC(12,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'libre', -- 'libre' | 'occupe' | 'travaux' | 'reserve'
    current_contract_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rental_tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(150),
    id_type VARCHAR(50) DEFAULT 'CIP', -- 'CIP' | 'Passeport' | 'Permis'
    id_number VARCHAR(100),
    profession VARCHAR(150),
    employer VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rental_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES rental_units(id),
    tenant_id UUID NOT NULL REFERENCES rental_tenants(id),
    contract_number VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    is_open_ended BOOLEAN DEFAULT true,
    monthly_rent NUMERIC(12,2) NOT NULL,
    charges NUMERIC(12,2) DEFAULT 0.00,
    deposit_amount NUMERIC(12,2) DEFAULT 0.00,
    deposit_paid BOOLEAN DEFAULT false,
    payment_day_of_month INT DEFAULT 5 CHECK (payment_day_of_month BETWEEN 1 AND 28),
    status VARCHAR(50) DEFAULT 'actif', -- 'actif' | 'resilié' | 'expiré'
    termination_date DATE,
    termination_reason TEXT,
    signed_at DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rental_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL REFERENCES rental_contracts(id),
    receipt_number VARCHAR(50) NOT NULL,
    period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year INT NOT NULL,
    amount_due NUMERIC(12,2) NOT NULL,
    amount_paid NUMERIC(12,2) NOT NULL,
    balance NUMERIC(12,2) GENERATED ALWAYS AS (amount_due - amount_paid) STORED,
    payment_method VARCHAR(50) DEFAULT 'especes',
    payment_date DATE DEFAULT CURRENT_DATE,
    late_fee NUMERIC(12,2) DEFAULT 0.00,
    collected_by UUID REFERENCES user_profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rental_repairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES rental_units(id),
    description TEXT NOT NULL,
    cost NUMERIC(12,2) DEFAULT 0.00,
    requested_at DATE DEFAULT CURRENT_DATE,
    completed_at DATE,
    charged_to VARCHAR(50) DEFAULT 'proprietaire', -- 'proprietaire' | 'locataire'
    status VARCHAR(50) DEFAULT 'en_attente',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rental_units_company ON rental_units(company_id);
CREATE INDEX IF NOT EXISTS idx_rental_contracts_company ON rental_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_rental_payments_company ON rental_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_rental_payments_period ON rental_payments(company_id, period_year, period_month);

ALTER TABLE rental_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_rental_properties" ON rental_properties USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_rental_units" ON rental_units USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_rental_tenants" ON rental_tenants USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_rental_contracts" ON rental_contracts USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_rental_payments" ON rental_payments USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_rental_repairs" ON rental_repairs USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());

-- ==============================================================================
-- M007 : ATELIER / GARAGE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS garage_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    plate_number VARCHAR(50) NOT NULL,
    brand VARCHAR(100),
    model VARCHAR(100),
    year INT,
    color VARCHAR(50),
    vin VARCHAR(50),
    fuel_type VARCHAR(50), -- 'essence' | 'gasoil' | 'hybride' | 'electrique'
    mileage INT DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS garage_repair_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    vehicle_id UUID REFERENCES garage_vehicles(id),
    customer_id UUID REFERENCES customers(id),
    mechanic_id UUID REFERENCES user_profiles(id),
    entry_mileage INT,
    entry_date DATE DEFAULT CURRENT_DATE,
    diagnosis TEXT,
    work_description TEXT,
    estimated_completion DATE,
    status VARCHAR(50) DEFAULT 'diagnostic',
    -- 'diagnostic' | 'en_cours' | 'attente_pieces' | 'pret' | 'livre' | 'annule'
    is_quote BOOLEAN DEFAULT false,
    quote_validated BOOLEAN DEFAULT false,
    labor_cost NUMERIC(12,2) DEFAULT 0.00,
    parts_cost NUMERIC(12,2) DEFAULT 0.00,
    total_amount NUMERIC(12,2) DEFAULT 0.00,
    advance_paid NUMERIC(12,2) DEFAULT 0.00,
    paid_amount NUMERIC(12,2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS garage_repair_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    repair_order_id UUID NOT NULL REFERENCES garage_repair_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    part_name VARCHAR(255) NOT NULL,
    reference VARCHAR(100),
    quantity NUMERIC(8,2) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    total_price NUMERIC(12,2) NOT NULL,
    from_stock BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_garage_vehicles_company ON garage_vehicles(company_id);
CREATE INDEX IF NOT EXISTS idx_garage_repairs_company ON garage_repair_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_garage_repairs_status ON garage_repair_orders(company_id, status);

ALTER TABLE garage_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_repair_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_repair_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_garage_vehicles" ON garage_vehicles USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_garage_repairs" ON garage_repair_orders USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_garage_parts" ON garage_repair_parts USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());

-- ==============================================================================
-- M008 : HÔTEL / RÉSIDENCE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS hotel_room_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- 'Standard' | 'VIP' | 'Suite' | 'Dortoir' | 'Prestige'
    description TEXT,
    base_price NUMERIC(12,2) NOT NULL,
    extra_person_fee NUMERIC(12,2) DEFAULT 0.00,
    max_occupancy INT DEFAULT 2,
    amenities JSONB DEFAULT '[]'::jsonb, -- ["wifi","climatisation","TV","minibar"]
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hotel_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category_id UUID REFERENCES hotel_room_categories(id) ON DELETE SET NULL,
    room_number VARCHAR(20) NOT NULL,
    floor INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'libre',
    -- 'libre' | 'occupe' | 'reserve' | 'nettoyage' | 'maintenance'
    current_reservation_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hotel_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    reservation_number VARCHAR(50) NOT NULL,
    room_id UUID REFERENCES hotel_rooms(id),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    actual_check_in TIMESTAMPTZ,
    actual_check_out TIMESTAMPTZ,
    adult_count INT DEFAULT 1,
    child_count INT DEFAULT 0,
    rate_per_night NUMERIC(12,2) NOT NULL,
    nights_count INT,
    subtotal NUMERIC(12,2) DEFAULT 0.00,
    services_total NUMERIC(12,2) DEFAULT 0.00,
    total_amount NUMERIC(12,2) DEFAULT 0.00,
    paid_amount NUMERIC(12,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'confirme',
    -- 'confirme' | 'checked_in' | 'checked_out' | 'annule' | 'no_show'
    special_requests TEXT,
    channel VARCHAR(50) DEFAULT 'direct', -- 'direct' | 'booking' | 'agence'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hotel_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES hotel_reservations(id) ON DELETE CASCADE,
    service_type VARCHAR(100), -- 'restaurant' | 'minibar' | 'blanchisserie' | 'telephonie' | 'excursion'
    description VARCHAR(255) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    quantity NUMERIC(8,2) DEFAULT 1,
    total NUMERIC(12,2) GENERATED ALWAYS AS (amount * quantity) STORED,
    added_by UUID REFERENCES user_profiles(id),
    added_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hotel_housekeeping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES hotel_rooms(id),
    task_type VARCHAR(50) DEFAULT 'nettoyage', -- 'nettoyage' | 'inspection' | 'preparation'
    assigned_to UUID REFERENCES user_profiles(id),
    status VARCHAR(50) DEFAULT 'en_attente', -- 'en_attente' | 'en_cours' | 'termine'
    scheduled_at DATE DEFAULT CURRENT_DATE,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_rooms_company ON hotel_rooms(company_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_company ON hotel_reservations(company_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_dates ON hotel_reservations(company_id, check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_status ON hotel_reservations(company_id, status);

ALTER TABLE hotel_room_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_housekeeping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_hotel_categories" ON hotel_room_categories USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_hotel_rooms" ON hotel_rooms USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_hotel_reservations" ON hotel_reservations USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_hotel_services" ON hotel_services USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_hotel_housekeeping" ON hotel_housekeeping USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());

-- ==============================================================================
-- M009 : MICROFINANCE & TONTINE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS mfi_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    member_number VARCHAR(50) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(150),
    address TEXT,
    id_type VARCHAR(50) DEFAULT 'CIP',
    id_number VARCHAR(100),
    profession VARCHAR(150),
    account_balance NUMERIC(15,2) DEFAULT 0.00,
    total_savings NUMERIC(15,2) DEFAULT 0.00,
    agent_id UUID REFERENCES user_profiles(id),
    status VARCHAR(50) DEFAULT 'actif', -- 'actif' | 'inactif' | 'suspendu'
    enrolled_at DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, member_number)
);

CREATE TABLE IF NOT EXISTS mfi_savings_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES mfi_members(id),
    transaction_number VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('depot', 'retrait')),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    balance_before NUMERIC(15,2) NOT NULL,
    balance_after NUMERIC(15,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'especes',
    agent_id UUID REFERENCES user_profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mfi_loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    loan_number VARCHAR(50) NOT NULL,
    member_id UUID NOT NULL REFERENCES mfi_members(id),
    agent_id UUID REFERENCES user_profiles(id),
    principal_amount NUMERIC(15,2) NOT NULL,
    interest_rate NUMERIC(6,3) NOT NULL, -- % mensuel (ex: 2.500 = 2,5% par mois)
    duration_months INT NOT NULL,
    installment_amount NUMERIC(15,2) NOT NULL,
    total_repayable NUMERIC(15,2) NOT NULL,
    amount_repaid NUMERIC(15,2) DEFAULT 0.00,
    outstanding_balance NUMERIC(15,2),
    disbursed_at DATE,
    first_repayment_date DATE,
    status VARCHAR(50) DEFAULT 'en_etude',
    -- 'en_etude' | 'approuve' | 'decaisse' | 'en_cours' | 'solde' | 'en_retard' | 'irr'
    purpose TEXT,
    guarantor_name VARCHAR(255),
    guarantor_phone VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, loan_number)
);

CREATE TABLE IF NOT EXISTS mfi_loan_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    loan_id UUID NOT NULL REFERENCES mfi_loans(id),
    installment_number INT NOT NULL,
    due_date DATE NOT NULL,
    principal_due NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    interest_due NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    penalty_due NUMERIC(15,2) DEFAULT 0.00,
    total_due NUMERIC(15,2) GENERATED ALWAYS AS (principal_due + interest_due + penalty_due) STORED,
    amount_paid NUMERIC(15,2) DEFAULT 0.00,
    paid_at DATE,
    status VARCHAR(50) DEFAULT 'en_attente',
    -- 'en_attente' | 'paye' | 'partiel' | 'en_retard'
    collected_by UUID REFERENCES user_profiles(id),
    payment_method VARCHAR(50) DEFAULT 'especes'
);

CREATE TABLE IF NOT EXISTS mfi_agent_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES user_profiles(id),
    reference_period VARCHAR(20) NOT NULL, -- "2026-09"
    total_collected NUMERIC(15,2) DEFAULT 0.00,
    commission_rate NUMERIC(5,3) DEFAULT 0.500, -- % sur les collectes
    commission_amount NUMERIC(15,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'en_attente', -- 'en_attente' | 'paye'
    paid_at DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- TONTINE
CREATE TABLE IF NOT EXISTS tontine_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    contribution_amount NUMERIC(12,2) NOT NULL,
    frequency VARCHAR(50) DEFAULT 'mensuel', -- 'hebdomadaire' | 'bimensuel' | 'mensuel'
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'actif', -- 'actif' | 'cloture'
    total_members INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tontine_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    cycle_id UUID NOT NULL REFERENCES tontine_cycles(id),
    member_id UUID NOT NULL REFERENCES mfi_members(id),
    round_number INT NOT NULL,
    due_date DATE NOT NULL,
    amount_due NUMERIC(12,2) NOT NULL,
    amount_paid NUMERIC(12,2) DEFAULT 0.00,
    paid_at DATE,
    status VARCHAR(50) DEFAULT 'en_attente', -- 'en_attente' | 'paye' | 'en_retard'
    agent_id UUID REFERENCES user_profiles(id),
    commission_amount NUMERIC(10,2) DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS idx_mfi_members_company ON mfi_members(company_id);
CREATE INDEX IF NOT EXISTS idx_mfi_loans_company ON mfi_loans(company_id);
CREATE INDEX IF NOT EXISTS idx_mfi_loans_status ON mfi_loans(company_id, status);
CREATE INDEX IF NOT EXISTS idx_mfi_repayments_loan ON mfi_loan_repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_tontine_contributions_cycle ON tontine_contributions(cycle_id);

ALTER TABLE mfi_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_savings_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfi_agent_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tontine_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tontine_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_mfi_members" ON mfi_members USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_mfi_savings" ON mfi_savings_transactions USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_mfi_loans" ON mfi_loans USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_mfi_repayments" ON mfi_loan_repayments USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_mfi_commissions" ON mfi_agent_commissions USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_tontine_cycles" ON tontine_cycles USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_tontine_contributions" ON tontine_contributions USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());

-- ==============================================================================
-- M010 : CENTRE D'IMPRESSION
-- ==============================================================================
CREATE TABLE IF NOT EXISTS print_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    quote_number VARCHAR(50) NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    designer_id UUID REFERENCES user_profiles(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_specs JSONB DEFAULT '{}'::jsonb,
    -- {format, dimensions, colors:"CMJN/quadri", paper_type, finish:"brillant/mat", quantity, support:"bâche/papier"}
    unit_price NUMERIC(12,2) DEFAULT 0.00,
    quantity INT DEFAULT 1,
    subtotal NUMERIC(12,2) DEFAULT 0.00,
    discount NUMERIC(12,2) DEFAULT 0.00,
    total_amount NUMERIC(12,2) DEFAULT 0.00,
    valid_until DATE,
    status VARCHAR(50) DEFAULT 'brouillon',
    -- 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'expire'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS print_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    quote_id UUID REFERENCES print_quotes(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    designer_id UUID REFERENCES user_profiles(id),
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'reception_fichier',
    -- 'reception_fichier' | 'conception' | 'bat_envoye' | 'bat_valide' |
    -- 'impression' | 'finition' | 'pret' | 'livre' | 'annule'
    is_subcontracted BOOLEAN DEFAULT false,
    subcontractor_name VARCHAR(255),
    subcontractor_cost NUMERIC(12,2) DEFAULT 0.00,
    raw_material_cost NUMERIC(12,2) DEFAULT 0.00,
    delivery_date DATE,
    advance_paid NUMERIC(12,2) DEFAULT 0.00,
    total_amount NUMERIC(12,2) DEFAULT 0.00,
    paid_amount NUMERIC(12,2) DEFAULT 0.00,
    production_notes TEXT,
    file_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE print_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_print_quotes" ON print_quotes USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_print_orders" ON print_orders USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());

-- ==============================================================================
-- M011 : BRASSERIE / DISTRIBUTEUR BOISSONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS brewery_consignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('sortie', 'retour')),
    reference_number VARCHAR(50) NOT NULL,
    product_type VARCHAR(100) NOT NULL, -- 'casiers_vides_biere' | 'casiers_vides_soda' | 'bouteilles'
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_deposit NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_deposit NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_deposit) STORED,
    balance_returned NUMERIC(12,2) DEFAULT 0.00,
    transaction_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brewery_price_grids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    client_type VARCHAR(50) NOT NULL, -- 'detail' | 'semi_gros' | 'gros' | 'vip'
    unit_price NUMERIC(12,2) NOT NULL,
    min_quantity INT DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    valid_from DATE DEFAULT CURRENT_DATE,
    valid_until DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE brewery_consignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE brewery_price_grids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_brewery_consignments" ON brewery_consignments USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_brewery_price_grids" ON brewery_price_grids USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
