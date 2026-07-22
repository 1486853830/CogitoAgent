const fs = require('fs');

const data = JSON.parse(fs.readFileSync('coverage/coverage-final.json', 'utf-8'));

let totalLines = 0;
let coveredLines = 0;
let totalFunctions = 0;
let coveredFunctions = 0;
let totalStatements = 0;
let coveredStatements = 0;
let totalBranches = 0;
let coveredBranches = 0;

for (const [filePath, fileData] of Object.entries(data)) {
  if (fileData.s) {
    const statements = Object.values(fileData.s);
    coveredStatements += statements.filter(v => v > 0).length;
    totalStatements += statements.length;
  }
  if (fileData.f) {
    const functions = Object.values(fileData.f);
    coveredFunctions += functions.filter(v => v > 0).length;
    totalFunctions += functions.length;
  }
  if (fileData.b) {
    const branches = Object.values(fileData.b).flat();
    coveredBranches += branches.filter(v => v > 0).length;
    totalBranches += branches.length;
  }
  totalLines = totalStatements;
  coveredLines = coveredStatements;
}

const lineCoverage = totalLines > 0 ? ((coveredLines / totalLines) * 100).toFixed(2) : '0.00';
const funcCoverage = totalFunctions > 0 ? ((coveredFunctions / totalFunctions) * 100).toFixed(2) : '0.00';
const stmtCoverage = totalStatements > 0 ? ((coveredStatements / totalStatements) * 100).toFixed(2) : '0.00';
const branchCoverage = totalBranches > 0 ? ((coveredBranches / totalBranches) * 100).toFixed(2) : '0.00';

console.log('Coverage Report:');
console.log(`Lines: ${lineCoverage}% (${coveredLines}/${totalLines})`);
console.log(`Functions: ${funcCoverage}% (${coveredFunctions}/${totalFunctions})`);
console.log(`Statements: ${stmtCoverage}% (${coveredStatements}/${totalStatements})`);
console.log(`Branches: ${branchCoverage}% (${coveredBranches}/${totalBranches})`);
