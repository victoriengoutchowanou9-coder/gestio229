'use client';

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer';
import { BonCommande } from '../types';

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#1e293b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: '#4338ca',
    paddingBottom: 15,
    marginBottom: 20,
  },
  companyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#312e81',
  },
  companyMeta: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 3,
  },
  docTitleBlock: {
    textAlign: 'right',
  },
  docTitle: {
    fontSize: 14,
    fontWeight: 'heavy',
    color: '#4338ca',
  },
  docRef: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 4,
  },
  docDate: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  },
  sectionSupplier: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#475569',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  supplierName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  table: {
    width: '100%',
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#312e81',
    color: '#ffffff',
    padding: 6,
    fontWeight: 'bold',
    fontSize: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    padding: 6,
    fontSize: 8,
  },
  colCode: { width: '15%' },
  colDesignation: { width: '40%' },
  colUnit: { width: '12%', textAlign: 'center' },
  colQty: { width: '13%', textAlign: 'center' },
  colPu: { width: '10%', textAlign: 'right' },
  colTotal: { width: '10%', textAlign: 'right' },
  totalsBlock: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 25,
  },
  totalsTable: {
    width: '45%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  grandTotalRow: {
    backgroundColor: '#eef2ff',
    fontWeight: 'bold',
    color: '#312e81',
  },
  ruleBadge: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    padding: 6,
    borderRadius: 4,
    marginBottom: 20,
    fontSize: 8,
    color: '#92400e',
  },
  signaturesSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  signatureBox: {
    width: '30%',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    padding: 8,
    textAlign: 'center',
    minHeight: 90,
  },
  sigTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 4,
  },
  sigSigner: {
    fontSize: 7,
    color: '#64748b',
    marginBottom: 6,
  },
  sigImage: {
    height: 45,
    objectFit: 'contain',
    alignSelf: 'center',
  },
  sigEmpty: {
    fontSize: 7,
    color: '#94a3b8',
    marginTop: 20,
    fontStyle: 'italic',
  },
  footerNotice: {
    position: 'absolute',
    bottom: 25,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 7,
    color: '#94a3b8',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
});

interface BcPrintDocumentProps {
  bc: BonCommande;
}

export const BcPrintDocument: React.FC<BcPrintDocumentProps> = ({ bc }) => {
  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('fr-FR').format(Math.round(val)) + ' FCFA';
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>GESTIO 229 ENTREPRISE</Text>
            <Text style={styles.companyMeta}>IFU: 3202600112233 | RCCM: RB/COT/2026/B/102</Text>
            <Text style={styles.companyMeta}>Carrefour Dantokpa, Cotonou - République du Bénin</Text>
            <Text style={styles.companyMeta}>Tél : +229 97 00 00 00 | contact@gestio229.bj</Text>
          </View>
          <View style={styles.docTitleBlock}>
            <Text style={styles.docTitle}>BON DE COMMANDE</Text>
            <Text style={styles.docRef}>{bc.reference}</Text>
            <Text style={styles.docDate}>Date : {bc.date_commande}</Text>
            <Text style={styles.docDate}>Statut : {bc.statut}</Text>
          </View>
        </View>

        {/* Fournisseur */}
        <View style={styles.sectionSupplier}>
          <Text style={styles.sectionTitle}>Fournisseur Destinataire :</Text>
          <Text style={styles.supplierName}>{bc.fournisseur_nom}</Text>
          <Text style={styles.companyMeta}>
            Date de livraison convenue : {bc.date_livraison_prevue || 'Selon délais contractuels'}
          </Text>
        </View>

        {/* Rappel Règle B.1 */}
        <View style={styles.ruleBadge}>
          <Text>
            RÈGLE DE GESTION B.1 : Toutes les quantités commandées et livrées sont strictement libellées en Unité de Conditionnement (UCD).
          </Text>
        </View>

        {/* Table des articles */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colCode}>Code</Text>
            <Text style={styles.colDesignation}>Désignation de l'Article</Text>
            <Text style={styles.colUnit}>Unité (UCD)</Text>
            <Text style={styles.colQty}>Quantité</Text>
            <Text style={styles.colPu}>P.U TTC</Text>
            <Text style={styles.colTotal}>Total TTC</Text>
          </View>

          {bc.lignes.map((l, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colCode}>{l.code_produit}</Text>
              <Text style={styles.colDesignation}>{l.nom_produit}</Text>
              <Text style={styles.colUnit}>{l.ucd}</Text>
              <Text style={styles.colQty}>{l.qte_commande}</Text>
              <Text style={styles.colPu}>{formatMoney(l.pu_ttc)}</Text>
              <Text style={styles.colTotal}>{formatMoney(l.total_ligne)}</Text>
            </View>
          ))}
        </View>

        {/* Totaux */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsTable}>
            <View style={[styles.totalsRow, styles.grandTotalRow]}>
              <Text style={{ fontWeight: 'bold' }}>TOTAL GÉNÉRAL TTC</Text>
              <Text style={{ fontWeight: 'bold' }}>{formatMoney(bc.total_ttc)}</Text>
            </View>
          </View>
        </View>

        {/* Signatures Électroniques Horodatées */}
        <View style={styles.signaturesSection}>
          {/* Gestionnaire */}
          <View style={styles.signatureBox}>
            <Text style={styles.sigTitle}>1. Visa Gestionnaire</Text>
            {bc.signatures.gestionnaire ? (
              <>
                <Text style={styles.sigSigner}>{bc.signatures.gestionnaire.signer_name}</Text>
                <Image
                  src={bc.signatures.gestionnaire.signature_image_base64}
                  style={styles.sigImage}
                />
              </>
            ) : (
              <Text style={styles.sigEmpty}>En attente de signature</Text>
            )}
          </View>

          {/* Directeur */}
          <View style={styles.signatureBox}>
            <Text style={styles.sigTitle}>2. Approbation Directeur</Text>
            {bc.signatures.directeur ? (
              <>
                <Text style={styles.sigSigner}>{bc.signatures.directeur.signer_name}</Text>
                <Image
                  src={bc.signatures.directeur.signature_image_base64}
                  style={styles.sigImage}
                />
              </>
            ) : (
              <Text style={styles.sigEmpty}>En attente de signature</Text>
            )}
          </View>

          {/* Magasinier */}
          <View style={styles.signatureBox}>
            <Text style={styles.sigTitle}>3. Réception Magasin</Text>
            {bc.signatures.magasinier ? (
              <>
                <Text style={styles.sigSigner}>{bc.signatures.magasinier.signer_name}</Text>
                <Image
                  src={bc.signatures.magasinier.signature_image_base64}
                  style={styles.sigImage}
                />
              </>
            ) : (
              <Text style={styles.sigEmpty}>En attente de réception</Text>
            )}
          </View>
        </View>

        {/* Pied de page */}
        <Text style={styles.footerNotice}>
          Document généré par GESTIO 229 V3 - Conforme aux exigences DGI Bénin (e-MECeF). 
          Toute livraison doit être accompagnée du présent bon de commande pour être admise au stock magasin.
        </Text>
      </Page>
    </Document>
  );
};
