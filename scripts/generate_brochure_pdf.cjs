const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const fs = require('fs');
const path = require('path');

const doc = new jsPDF({
  orientation: 'portrait',
  unit: 'mm',
  format: 'a4',
});

const pageWidth = doc.internal.pageSize.getWidth(); // 210
const pageHeight = doc.internal.pageSize.getHeight(); // 297

// --- PAGE 1: Couverture & Présentation Générale ---
// En-tête avec bandeau vert émeraude
doc.setFillColor(16, 185, 129); // emerald-500
doc.rect(0, 0, pageWidth, 42, 'F');

doc.setFillColor(15, 23, 42); // slate-900 bande d'accent
doc.rect(0, 42, pageWidth, 4, 'F');

// Titre principal
doc.setTextColor(255, 255, 255);
doc.setFont('helvetica', 'bold');
doc.setFontSize(26);
doc.text('GESTIO 229', 14, 20);

doc.setFontSize(12);
doc.setFont('helvetica', 'normal');
doc.text('Le Progiciel SaaS Tout-en-Un pour Entreprises & Commerces', 14, 28);

doc.setFontSize(10);
doc.setFont('helvetica', 'italic');
doc.text('Web • Tablettes • Android • Conforme UEMOA & République du Bénin', 14, 35);

// Badge site web en haut à droite
doc.setFillColor(255, 255, 255);
doc.roundedRect(pageWidth - 62, 12, 48, 18, 3, 3, 'F');
doc.setTextColor(5, 150, 105);
doc.setFont('helvetica', 'bold');
doc.setFontSize(10);
doc.text('SITE OFFICIEL', pageWidth - 55, 18);
doc.setFontSize(11);
doc.setTextColor(15, 23, 42);
doc.text('www.gestio229.com', pageWidth - 60, 25);

// Slogan d'introduction
let currentY = 54;
doc.setTextColor(15, 23, 42);
doc.setFont('helvetica', 'bold');
doc.setFontSize(15);
doc.text('PILOTEZ TOUTE VOTRE ACTIVITÉ SUR UNE SEULE PLATEFORME', 14, currentY);

currentY += 7;
doc.setFont('helvetica', 'normal');
doc.setFontSize(9.5);
doc.setTextColor(71, 85, 105);
const introText = "GESTIO 229 est le logiciel de gestion en ligne de référence conçu pour booster la rentabilité, automatiser la caisse, sécuriser les stocks et contrôler la trésorerie des entreprises africaines. Accessible sur ordinateur et téléphone mobile Android, il s'adapte précisément aux spécificités de 20 secteurs d'activité avec une isolation stricte des données.";
const splitIntro = doc.splitTextToSize(introText, pageWidth - 28);
doc.text(splitIntro, 14, currentY);

currentY += splitIntro.length * 4.5 + 4;

// 4 Piliers clés sous forme de cartes
const pillars = [
  { title: '⚡ Encaissement & POS', desc: 'Tickets de caisse, clôtures de session journalières, multi-moyens de paiement (Espèces, MoMo, Carte, Chèque).' },
  { title: '📦 Stocks & Inventaires', desc: 'Gestion des entrées/sorties, alertes automatiques de réapprovisionnement, gestion des lots, DLC et avaries.' },
  { title: '💰 Trésorerie & SYSCOHADA', desc: 'Suivi des comptes banques, caisses, rapprochement, créances clients, ardoises et comptabilité normalisée.' },
  { title: '👥 Équipe & Contrôle RH', desc: 'Gestion des rôles métiers, permissions granulaires par module, fiches de paie et calcul CNSS Bénin.' },
];

const colWidth = (pageWidth - 28 - 6) / 2;
pillars.forEach((p, idx) => {
  const x = 14 + (idx % 2) * (colWidth + 6);
  const y = currentY + Math.floor(idx / 2) * 22;
  
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(x, y, colWidth, 19, 2, 2, 'FD');

  doc.setTextColor(5, 150, 105);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(p.title, x + 3, y + 5.5);

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const descLines = doc.splitTextToSize(p.desc, colWidth - 6);
  doc.text(descLines, x + 3, y + 10);
});

currentY += 48;

// Section Grille Tarifaire & Abonnements
doc.setTextColor(15, 23, 42);
doc.setFont('helvetica', 'bold');
doc.setFontSize(14);
doc.text('NOS FORMULES D\'ABONNEMENT ACCESSIBLES EN FCFA', 14, currentY);

currentY += 6;

// Table des Abonnements avec autoTable
doc.autoTable({
  startY: currentY,
  head: [['Formule', 'Tarif Mensuel', 'Activités Incluses', 'Modules & Fonctionnalités Inclus']],
  body: [
    [
      'ESSAI GRATUIT\n(Découverte)',
      '0 FCFA\n(30 Jours)',
      '1 activité au choix',
      '• Accès découverte sans engagement\n• Caisse, POS, Stocks, Ventes, Clients\n• Sans carte bancaire requise'
    ],
    [
      'PLAN STARTER\n(Essentiel)',
      '5 000 FCFA\n/ mois',
      '1 activité au choix',
      '• Tableau de bord complet\n• Caisse & Vente POS comptoir\n• Gestion des stocks & alertes\n• Clients, créances & dépenses courantes\n• Support WhatsApp standard'
    ],
    [
      'PLAN ENTREPRISE\n(Recommandé)',
      '10 000 FCFA\n/ mois',
      '1 activité au choix\n(Tous modules)',
      '• TOUS LES MODULES DE L\'ACTIVITÉ INCLUS\n• Trésorerie & multi-comptes bancaires\n• Reporting financier & marges avancées\n• Inventaire physique avec valorisation des écarts\n• Comptabilité SYSCOHADA Révisé\n• Modules métiers ultra-spécialisés\n• Facturation certifiée e-MECeF'
    ],
    [
      'OFFRE MULTISECTEUR\n(Multi-Activités)',
      'Sur Mesure\n(Concepteur)',
      '2, 3 ou plus d\'activités\n(Groupes & Holdings)',
      '• Multi-entreprises et multi-secteurs interconnectés\n• Permissions fines et rôles sur mesure\n• Accompagnement VIP dédié et formation sur site\n• Validation et activation Super Admin'
    ],
  ],
  theme: 'grid',
  headStyles: {
    fillColor: [16, 185, 129],
    textColor: [255, 255, 255],
    fontStyle: 'bold',
    fontSize: 8.5,
    halign: 'center',
  },
  bodyStyles: {
    fontSize: 7.8,
    textColor: [30, 41, 59],
    valign: 'middle',
  },
  columnStyles: {
    0: { cellWidth: 35, fontStyle: 'bold', halign: 'center' },
    1: { cellWidth: 28, fontStyle: 'bold', textColor: [5, 150, 105], halign: 'center' },
    2: { cellWidth: 34, halign: 'center' },
    3: { cellWidth: 'auto' },
  },
  margin: { left: 14, right: 14 },
});

// Bas de page 1
doc.setFontSize(8);
doc.setFont('helvetica', 'normal');
doc.setTextColor(148, 163, 184);
doc.text('GESTIO 229 • Brochure Officielle des Activités & Tarifs • Document généré le ' + new Date().toLocaleDateString('fr-FR'), 14, pageHeight - 8);
doc.text('Page 1 / 2', pageWidth - 28, pageHeight - 8);


// --- PAGE 2: Catalogue Exhaustif des 20 Métiers ---
doc.addPage();

// En-tête Page 2
doc.setFillColor(15, 23, 42); // slate-900
doc.rect(0, 0, pageWidth, 24, 'F');
doc.setFillColor(16, 185, 129);
doc.rect(0, 24, pageWidth, 2.5, 'F');

doc.setTextColor(255, 255, 255);
doc.setFont('helvetica', 'bold');
doc.setFontSize(14);
doc.text('LES 20 SECTEURS D\'ACTIVITÉ COUVERTS PAR GESTIO 229', 14, 15);

doc.setFontSize(8.5);
doc.setFont('helvetica', 'normal');
doc.setTextColor(203, 213, 225);
doc.text('Chaque secteur dispose de son écran dédié, de ses règles de gestion et de ses rôles professionnels.', 14, 20);

// Données des 20 activités
const activitiesData = [
  ['1', 'Quincaillerie & Matériaux', 'BTP & Construction', 'Ciment, fer à béton, conversions d\'unités (tonnes, sacs, barres), suivi des chantiers & camions.'],
  ['2', 'Poissonnerie & Produits Frais', 'Alimentation & Frais', 'Cartons, balance de pesée kg, chambres froides, températures et gestion des avaries.'],
  ['3', 'Bar, Restaurant & Fast Food', 'Restauration & CHR', 'Plan de table en direct, cuisine KDS, fiches recettes, réservations, gestion des serveurs & ardoises.'],
  ['4', 'Supermarché & Supérette', 'Grande Distribution', 'Lecteur code-barres rapide, rayons/gondoles, alertes DLC courtes, promotions et fidélité client.'],
  ['5', 'Pharmacie & Dépôt Médical', 'Santé & Médicaments', 'Ordonnances, numéros de lots, gestion rigoureuse des dates de péremption et répartiteurs.'],
  ['6', 'Station-Service & Hydrocarbures', 'Énergie & Carburants', 'Index pompes, jauges cuves, clôtures de postes pompistes, lubrifiants et citernes.'],
  ['7', 'Hôtel & Hébergement', 'Hôtellerie', 'Planning des chambres, réservations, check-in/out, gouvernante (housekeeping) et room service.'],
  ['8', 'École & Centre de Formation', 'Éducation', 'Scolarités, tranches de paiement, fiches élèves, notes, bulletins et suivi des absences.'],
  ['9', 'Gestion Locative & Immobilier', 'Immobilier & Baux', 'Contrats de bail, états des lieux, cautions, quittances de loyer automatiques et alertes impayés.'],
  ['10', 'Garage & Atelier Mécanique', 'Automobile', 'Ordres de réparation (OR), pièces détachées, devis main-d\'œuvre et planning des ponts.'],
  ['11', 'Imprimerie & Sérigraphie', 'Industrie Graphique', 'Nomenclature BOM (matières premières), devis production au m², bons à tirer (BAT) et sous-traitance.'],
  ['12', 'Brasserie & Dépôt Boissons', 'Boissons & Gros', 'Consignations de casiers et bouteilles pleines/vides, grilles tarifaires maquis et grossistes.'],
  ['13', 'Microfinance & Tontine', 'Finance UEMOA', 'Comptes épargne, tontines journalières, dossiers de crédit, agents collecteurs et conformité BCEAO.'],
  ['14', 'Agro-Business & Élevage', 'Agriculture & Élevage', 'Gestion des intrants, provendes, cheptel, suivi de récoltes et ventes en gros.'],
  ['15', 'Cosmétiques & Salons', 'Beauté & Bien-être', 'Prestations soins, coiffure, gestion des produits cosmétiques et forfaits bien-être.'],
  ['16', 'Mercerie & Couture', 'Mode & Confection', 'Tissus au mètre, boutons, fermetures, commandes sur-mesure et calendrier de retouches.'],
  ['17', 'Boutique & Magasin de Détail', 'Commerce Général', 'Vente comptoir, prêt-à-porter, alimentation générale, bazar et électroménager.'],
  ['18', 'Boulangerie & Pâtisserie', 'Alimentation Artisanale', 'Pains, viennoiseries, gestion des fournées, suivi des invendus et matières premières (farines).'],
  ['19', 'Transport & Logistique', 'Fret & Transport', 'Flotte camions, suivi des trajets, bordereaux de livraison et fret interurbain.'],
  ['20', 'Flotte & Géolocalisation GPS', 'Transport IoT', 'Carte GPS en direct, traceurs, suivi carburant, maintenance, zones géographiques (geofences).'],
];

doc.autoTable({
  startY: 30,
  head: [['N°', 'Activité Métier', 'Catégorie', 'Fonctionnalités Spécifiques & Modules Dédiés']],
  body: activitiesData,
  theme: 'striped',
  headStyles: {
    fillColor: [15, 23, 42],
    textColor: [255, 255, 255],
    fontStyle: 'bold',
    fontSize: 7.8,
    halign: 'center',
  },
  bodyStyles: {
    fontSize: 6.8,
    textColor: [30, 41, 59],
    cellPadding: 1.6,
  },
  columnStyles: {
    0: { cellWidth: 9, halign: 'center', fontStyle: 'bold' },
    1: { cellWidth: 46, fontStyle: 'bold', textColor: [5, 150, 105] },
    2: { cellWidth: 35, fontStyle: 'italic', textColor: [100, 116, 139] },
    3: { cellWidth: 'auto' },
  },
  margin: { left: 14, right: 14 },
});

// Cadre Contact & Démarrage immédiat
const finalY = doc.lastAutoTable.finalY + 4;
doc.setFillColor(240, 253, 244); // emerald-50
doc.setDrawColor(16, 185, 129);
doc.roundedRect(14, finalY, pageWidth - 28, 25, 3, 3, 'FD');

doc.setTextColor(5, 150, 105);
doc.setFont('helvetica', 'bold');
doc.setFontSize(11);
doc.text('🚀 DÉMARREZ DÈS AUJOURD\'HUI AVEC 30 JOURS D\'ESSAI GRATUIT', 20, finalY + 6.5);

doc.setFont('helvetica', 'normal');
doc.setFontSize(8);
doc.setTextColor(51, 65, 85);
doc.text('1. Rendez-vous directement sur www.gestio229.com et cliquez sur "Créer un compte".', 20, finalY + 12);
doc.text('2. Choisissez votre activité et commencez immédiatement à enregistrer vos ventes et dépenses.', 20, finalY + 16.5);
doc.text('3. Support & Assistance personnalisée WhatsApp : +229 01 97 00 00 00 / contact@gestio229.com', 20, finalY + 21);

// Bas de page 2
doc.setFontSize(8);
doc.setFont('helvetica', 'normal');
doc.setTextColor(148, 163, 184);
doc.text('GESTIO 229 • www.gestio229.com • Conçu avec fierté pour l\'Afrique 🇧🇯', 14, pageHeight - 8);
doc.text('Page 2 / 2', pageWidth - 28, pageHeight - 8);

// Sauvegarde dans le dossier scratch
const outputDir = path.resolve(__dirname, '..', 'public');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
const outputPath = path.join(outputDir, 'GESTIO_229_Brochure_Activites_et_Abonnements.pdf');
const pdfBytes = doc.output('arraybuffer');
fs.writeFileSync(outputPath, Buffer.from(pdfBytes));

console.log('✅ PDF Brochure généré avec succès :', outputPath);
