'use strict';
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'dashboard', 'utilisateurs', 'UtilisateursPage.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// Checks
const modalExists = c.includes('{/* MODAL AVANCES') || c.includes('selectedStaffForDebt &&');
const rapportsExists = c.includes("activeTab === 'rapports' &&") || c.includes('activeTab === \'rapports\'');
const auditIdx = c.indexOf("activeTab === 'audit'");
const auditLine = c.substring(0, auditIdx).split('\n').length;
console.log('Avances modal exists:', modalExists);
console.log('Rapports tab exists:', rapportsExists);
console.log('Audit tab at line:', auditLine);
console.log('File lines:', c.split('\n').length);
