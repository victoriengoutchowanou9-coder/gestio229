const fs = require('fs');
let code = fs.readFileSync('src/pages/dashboard/DashboardPage.tsx', 'utf8');

const faulty = [
  '      try {',
  '        const avList = await getAllAvoirs(companyId, currentSectorSlug)',
  '        setAvoirsDuMois(avList)',
  '        }',
  '      } catch (rErr) {',
  '        console.warn(\'Avertissement chargement v_resume_activite:\', rErr)',
  '      }'
].join('\n');

const fixed = [
  '      try {',
  '        const avList = await getAllAvoirs(companyId, currentSectorSlug)',
  '        setAvoirsDuMois(avList)',
  '      } catch (avErr) {',
  '        console.warn(\'Avertissement chargement avoirs:\', avErr)',
  '      }'
].join('\n');

// Try both \n and \r\n
if (code.includes(faulty)) {
  code = code.replace(faulty, fixed);
} else {
  const faultyCr = faulty.replace(/\n/g, '\r\n');
  const fixedCr = fixed.replace(/\n/g, '\r\n');
  code = code.replace(faultyCr, fixedCr);
}

fs.writeFileSync('src/pages/dashboard/DashboardPage.tsx', code, 'utf8');
console.log('Fixed syntax error in DashboardPage.tsx');
