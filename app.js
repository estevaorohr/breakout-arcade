const pdfInput = document.getElementById('pdf-input');
const parseButton = document.getElementById('parse-btn');
const table = document.getElementById('entries-table');
const tbody = document.getElementById('entries-body');
const categoriesTable = document.getElementById('categories-table');
const categoriesBody = document.getElementById('categories-body');
const sortHeaders = document.querySelectorAll('.sortable');
const tabs = document.querySelectorAll('.tab');
const entriesView = document.getElementById('entries-view');
const categoriesView = document.getElementById('categories-view');
const categoryManagerView = document.getElementById('category-manager-view');
const monthsView = document.getElementById('months-view');
const billsView = document.getElementById('bills-view');
const rulesView = document.getElementById('rules-view');
const rulesForm = document.getElementById('rules-form');
const ruleKeyword = document.getElementById('rule-keyword');
const ruleCategory = document.getElementById('rule-category');
const rerunRulesButton = document.getElementById('rerun-rules-btn');
const rulesStatus = document.getElementById('rules-status');
const rulesBody = document.getElementById('rules-body');
const billsStatus = document.getElementById('bills-status');
const billsBody = document.getElementById('bills-body');
const monthsBody = document.getElementById('months-body');
const categoryFilter = document.getElementById('category-filter');
const companyFilter = document.getElementById('company-filter');
const categoryManagerForm = document.getElementById('category-manager-form');
const newCategoryInput = document.getElementById('new-category-name');
const categoryManagerStatus = document.getElementById('category-manager-status');
const categoryManagerBody = document.getElementById('category-manager-body');
const pdfPasswordInput = document.getElementById('pdf-password');

let entries = [];
let currentSort = 'amount';
let sortDescending = true;
let currentView = 'categories';
let rules = [];
let bills = [];
let categories = [];

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

function parseDate(value) {
  const match = value.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}(?:\/\d{4})?)/);
  if (!match) return null;

  const raw = match[1];
  if (raw.includes('-')) {
    const [year, month, day] = raw.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const [day, month, year] = raw.split('/').map(Number);
  return new Date((year || 2000), (month || 1) - 1, day || 1);
}

function formatDisplayDate(value) {
  const parsed = parseDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return value || 'Unknown';
  }

  return parsed.toLocaleDateString('pt-BR');
}

function extractBillDateFromText(text) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 25);

  for (const line of lines) {
    const match = line.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}(?:\/\d{4})?)/);
    if (!match) continue;

    const candidate = match[1];
    const normalized = line.toLowerCase();
    const isHeaderLike = /(fatura|statement|bill|date|data|vencimento|fechamento|período|periodo|closing|billing|corte)/i.test(normalized)
      || !/(r\$|valor|amount|total|saldo|cobrado|pagamento|boleto|crédito|credit|parcel)/i.test(normalized);

    if (isHeaderLike) {
      return candidate;
    }
  }

  const fallbackMatch = text.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}(?:\/\d{4})?)/);
  return fallbackMatch ? fallbackMatch[1] : null;
}

function getDefaultCategories() {
  return ['Food', 'Transport', 'Groceries', 'Services', 'Travel', 'Shopping', 'Healthcare', 'School', 'Other'];
}

function loadCategories() {
  try {
    const storedCategories = localStorage.getItem('bill-categories');
    const parsedCategories = storedCategories ? JSON.parse(storedCategories) : null;

    if (Array.isArray(parsedCategories) && parsedCategories.length) {
      categories = parsedCategories
        .map((item) => String(item).trim())
        .filter(Boolean)
        .filter((item, index, array) => array.indexOf(item) === index);
    } else {
      categories = getDefaultCategories();
    }

    if (!categories.includes('Other')) {
      categories.push('Other');
    }
  } catch (error) {
    console.error('Unable to load categories:', error);
    categories = getDefaultCategories();
  }
}

function saveCategories() {
  try {
    localStorage.setItem('bill-categories', JSON.stringify(categories));
  } catch (error) {
    console.error('Unable to save categories:', error);
  }
}

function populateCategorySelectors() {
  const options = categories.map((category) => category.trim()).filter(Boolean);
  const buildOptions = (select, includeAll = false) => {
    if (!select) return;
    select.innerHTML = '';

    if (includeAll) {
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'All categories';
      select.appendChild(allOption);
    }

    options.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      select.appendChild(option);
    });
  };

  const previousFilterValue = categoryFilter && categoryFilter.value && categoryFilter.value !== 'all' ? categoryFilter.value : 'all';
  const previousRuleValue = ruleCategory && ruleCategory.value ? ruleCategory.value : '';

  buildOptions(categoryFilter, true);
  buildOptions(ruleCategory, false);

  if (categoryFilter) {
    categoryFilter.value = categories.includes(previousFilterValue) ? previousFilterValue : 'all';
  }

  if (ruleCategory) {
    if (previousRuleValue && categories.includes(previousRuleValue)) {
      ruleCategory.value = previousRuleValue;
    } else {
      ruleCategory.value = categories.includes('Other') ? 'Other' : options[0] || '';
    }
  }
}

function syncCategoriesWithEntries() {
  const seen = new Set(categories);
  entries.forEach((entry) => {
    const category = entry.category && String(entry.category).trim();
    if (category && !seen.has(category)) {
      seen.add(category);
    }
  });

  categories = Array.from(seen).filter(Boolean);
  if (!categories.includes('Other')) {
    categories.push('Other');
  }
  saveCategories();
}

function normalizeCategoriesForEntries() {
  entries = entries.map((entry) => {
    const category = entry.category && String(entry.category).trim();
    if (category) {
      return { ...entry, category };
    }

    return { ...entry, category: 'Other' };
  });

  syncCategoriesWithEntries();
}

function loadRules() {
  try {
    const storedRules = localStorage.getItem('bill-rules');
    rules = storedRules ? JSON.parse(storedRules) : [];
    if (Array.isArray(rules)) {
      rulesStatus.textContent = rules.length
        ? `Loaded ${rules.length} saved rule${rules.length === 1 ? '' : 's'}.`
        : 'No custom rules yet.';
    } else {
      rules = [];
      rulesStatus.textContent = 'No custom rules yet.';
    }
  } catch (error) {
    console.error('Unable to load rules:', error);
    rules = [];
    rulesStatus.textContent = 'No custom rules yet.';
  }
}

function saveRules() {
  try {
    localStorage.setItem('bill-rules', JSON.stringify(rules));
  } catch (error) {
    console.error('Unable to save rules:', error);
  }
}

function loadBills() {
  try {
    const storedBills = localStorage.getItem('saved-bills');
    bills = storedBills ? JSON.parse(storedBills) : [];
    if (!Array.isArray(bills)) {
      bills = [];
    }
  } catch (error) {
    console.error('Unable to load bills:', error);
    bills = [];
  }
}

function saveBills() {
  try {
    localStorage.setItem('saved-bills', JSON.stringify(bills));
  } catch (error) {
    console.error('Unable to save bills:', error);
  }
}

function loadEntries() {
  try {
    const storedEntries = localStorage.getItem('active-entries');
    if (storedEntries) {
      const parsedEntries = JSON.parse(storedEntries);
      entries = Array.isArray(parsedEntries) ? parsedEntries : [];
    } else {
      entries = (bills || []).flatMap((bill) => (bill.data || []).map((entry) => ({
        ...entry,
        billId: entry.billId || bill.id,
        cardCompany: entry.cardCompany || bill.company,
        month: entry.month || bill.month || 'Unknown'
      })));
    }
  } catch (error) {
    console.error('Unable to load entries:', error);
    entries = [];
  }
}

function saveEntries() {
  try {
    localStorage.setItem('active-entries', JSON.stringify(entries));
  } catch (error) {
    console.error('Unable to save entries:', error);
  }
}

function getPreviousMonthLabel(dateValue) {
  const parsedDate = parseDate(dateValue);
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return 'Unknown';
  }

  const previousMonthDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth() - 1, 1);
  return previousMonthDate.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
}

function classifyEntry(description) {
  const text = description.toLowerCase();

  const matchingRule = [...rules]
    .sort((a, b) => b.keyword.length - a.keyword.length)
    .find((rule) => text.includes(rule.keyword.toLowerCase()));

  if (matchingRule) return matchingRule.category;

  if (/(restaurant|food|cafe|coffee|pizza|burger|bakery|delivery|restaurant)/.test(text)) return 'Food';
  if (/(gas|fuel|uber|taxi|transport|metro|train|parking|toll)/.test(text)) return 'Transport';
  if (/(supermarket|market|grocery|mercado|drugstore|farmacia|pharmacy)/.test(text)) return 'Groceries';
  if (/(internet|phone|wifi|utility|energy|water|light|streaming|netflix)/.test(text)) return 'Services';
  if (/(hotel|flight|travel|ticket|airline)/.test(text)) return 'Travel';
  if (/(shop|shopping|store|clothing|fashion|amazon|marketplace)/.test(text)) return 'Shopping';
  if (/(medical|health|hospital|clinic|pharmacy)/.test(text)) return 'Healthcare';
  if (/(school|college|university|education|course|study|student|teacher|university)/.test(text)) return 'School';
  return 'Other';
}

function parseAmount(text) {
  const amountMatches = [...text.matchAll(/(?:R\$\s*)?(-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2}))/g)];
  if (!amountMatches.length) return null;

  const match = amountMatches[amountMatches.length - 1][0];
  let raw = match.replace(/[^\d,.-]/g, '');
  if (!raw) return null;

  if (raw.includes('.') && raw.includes(',')) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if (raw.includes(',')) {
    raw = raw.replace(',', '.');
  }

  const value = Number.parseFloat(raw);
  return Number.isNaN(value) ? null : Math.abs(value);
}

function extractDateFromText(text) {
  const match = text.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}(?:\/\d{4})?)/);
  return match ? match[1] : null;
}

function normalizeDescription(text) {
  return text
    .replace(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}(?:\/\d{4})?)/g, '')
    .replace(/(?:R\$\s*)?(?:-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2}))/g, '')
    .replace(/[•●▪-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNoiseLine(line) {
  const text = line.toLowerCase();
  const noisePatterns = [
    /statement|fatura|page|página|total|balance|saldo|payment|pagamento|due|vencimento|minimum|mínimo|credit limit|limite|available|disponível|interest|juros|closing date|data de fechamento|summary|resumo|description|descrição|amount|valor|currency|moeda|date|data|boleto|beneficiário|pagador|instruções|autenticação|código|código de barras|cpf|cnpj|local de pagamento|valor do documento|valor cobrado|parcela|parcelado|rotativo|crédito|estornos|créditos|pagar|futuro|reais/i
  ];

  const strongNoise = /^(resumo|opções de pagamento|pagamento total|pagamento mínimo|limite total|limite disponível|saques|pagamento à vista|pagamento parcelado|total da fatura|fatura anterior|fechamento da fatura|valor do documento|valor cobrado|pagador|beneficiário|instruções|autenticação|corte na linha|picpay|mastercard|visa|american express|boleto|pagamento recebido)$/i;

  return !line || line.length < 3 || strongNoise.test(text) || noisePatterns.some((pattern) => pattern.test(text)) || /^\d+$/.test(line);
}

function extractCostEntries(lines) {
  const parsed = [];
  const seen = new Set();

  lines.forEach((line) => {
    const cleanLine = line.trim();
    if (isNoiseLine(cleanLine)) return;

    const amount = parseAmount(cleanLine);
    if (!amount) return;

    const date = extractDateFromText(cleanLine);
    const description = normalizeDescription(cleanLine);

    if (!description || description.length < 2) return;

    const lowerDescription = description.toLowerCase();
    const looksLikeMeta = /(picpay|mastercard|boleto|beneficiário|pagador|instruções|autenticação|código de barras|cpf|cnpj|limite|resumo|fatura|vencimento|fechamento|crédito|estorno|pagamento|rotativo|juros|cálculo|parcela|mês de|total da|subtotal|total geral)/.test(lowerDescription);
    if (looksLikeMeta) return;

    if (!date) return;

    const key = `${date}|${amount}|${lowerDescription}`;
    if (seen.has(key)) return;

    seen.add(key);
    parsed.push({
      date,
      description,
      amount,
      category: classifyEntry(description)
    });
  });

  return parsed.filter((entry) => entry.description && entry.amount);
}

function buildLinesFromPdfText(text) {
  const lines = [];
  const chunks = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  chunks.forEach((chunk) => {
    const parts = chunk.split(/\s{2,}/).filter(Boolean);
    if (parts.length > 1) {
      parts.forEach((part) => lines.push(part));
    } else {
      lines.push(chunk);
    }
  });

  return lines.filter((line) => line && line.length > 1);
}

function populateCompanyFilter() {
  if (!companyFilter) return;

  const companies = Array.from(new Set(entries.map((entry) => entry.cardCompany || 'Unknown').filter(Boolean))).sort();
  const currentValue = companyFilter.value || 'all';

  companyFilter.innerHTML = '<option value="all">All card companies</option>';
  companies.forEach((company) => {
    const option = document.createElement('option');
    option.value = company;
    option.textContent = company;
    companyFilter.appendChild(option);
  });

  if (companies.includes(currentValue)) {
    companyFilter.value = currentValue;
  } else {
    companyFilter.value = 'all';
  }
}

function renderEntriesTable() {
  tbody.innerHTML = '';
  const selectedCategory = categoryFilter ? categoryFilter.value : 'all';
  const selectedCompany = companyFilter ? companyFilter.value : 'all';
  const filteredEntries = entries.filter((entry) => {
    const matchesCategory = selectedCategory === 'all' || entry.category === selectedCategory;
    const matchesCompany = selectedCompany === 'all' || (entry.cardCompany || 'Unknown') === selectedCompany;
    return matchesCategory && matchesCompany;
  });

  table.hidden = filteredEntries.length === 0;

  if (!filteredEntries.length) {
    return;
  }

  const sortedEntries = [...filteredEntries].sort((a, b) => {
    if (currentSort === 'amount') {
      const result = a.amount - b.amount;
      return sortDescending ? -result : result;
    }

    const aDate = parseDate(a.date) || new Date(0);
    const bDate = parseDate(b.date) || new Date(0);
    const result = aDate - bDate;
    return sortDescending ? -result : result;
  });

  sortedEntries.forEach((entry) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${entry.date}</td>
      <td>${entry.description}</td>
      <td class="amount-cell">${formatCurrency(entry.amount)}</td>
      <td>${entry.month || 'Unknown'}</td>
      <td>${entry.cardCompany || 'Unknown'}</td>
      <td>${entry.category}</td>
    `;
    tbody.appendChild(row);
  });

}

function renderCategoryTable() {
  categoriesBody.innerHTML = '';
  categoriesTable.hidden = entries.length === 0;

  if (!entries.length) {
    return;
  }

  const groupedEntries = entries.reduce((acc, entry) => {
    if (!acc[entry.category]) {
      acc[entry.category] = [];
    }
    acc[entry.category].push(entry);
    return acc;
  }, {});

  const categories = Object.keys(groupedEntries).sort((a, b) => {
    const totalA = groupedEntries[a].reduce((sum, item) => sum + item.amount, 0);
    const totalB = groupedEntries[b].reduce((sum, item) => sum + item.amount, 0);
    const result = totalA - totalB;
    return sortDescending ? -result : result;
  });

  categories.forEach((category) => {
    const categoryEntries = [...groupedEntries[category]].sort((a, b) => {
      const result = a.amount - b.amount;
      return sortDescending ? -result : result;
    });
    const totalValue = categoryEntries.reduce((sum, item) => sum + item.amount, 0);

    const categoryRow = document.createElement('tr');
    categoryRow.className = 'category-summary-row';
    categoryRow.innerHTML = `
      <td><button class="expand-category-btn" type="button">▶</button> ${category}</td>
      <td>${categoryEntries[0]?.month || 'Unknown'}</td>
      <td>${categoryEntries[0]?.cardCompany || 'Unknown'}</td>
      <td class="amount-cell">${formatCurrency(totalValue)}</td>
    `;
    categoriesBody.appendChild(categoryRow);

    const childRows = document.createElement('tr');
    childRows.className = 'category-detail-row';
    childRows.innerHTML = `
      <td colspan="4">
        <div class="category-detail-content" hidden>
          <table class="nested-table">
            <tbody></tbody>
          </table>
        </div>
      </td>
    `;
    categoriesBody.appendChild(childRows);

    const detailBody = childRows.querySelector('tbody');
    categoryEntries.forEach((entry) => {
      const detailRow = document.createElement('tr');
      detailRow.innerHTML = `
        <td>${entry.date}</td>
        <td>${entry.description}</td>
        <td class="amount-cell">${formatCurrency(entry.amount)}</td>
        <td>${entry.month || 'Unknown'}</td>
      `;
      detailBody.appendChild(detailRow);
    });

    categoryRow.querySelector('.expand-category-btn').addEventListener('click', () => {
      const content = childRows.querySelector('.category-detail-content');
      const isHidden = content.hidden;
      content.hidden = !isHidden;
      categoryRow.querySelector('.expand-category-btn').textContent = isHidden ? '▼' : '▶';
    });
  });
}

function renderMonthTable() {
  monthsBody.innerHTML = '';
  const monthsTable = document.getElementById('months-table');
  monthsTable.hidden = entries.length === 0;

  if (!entries.length) {
    return;
  }

  const totals = entries.reduce((acc, entry) => {
    const key = `${entry.month || 'Unknown'}::${entry.cardCompany || 'Unknown'}`;
    if (!acc[key]) {
      acc[key] = {
        month: entry.month || 'Unknown',
        cardCompany: entry.cardCompany || 'Unknown',
        value: 0
      };
    }
    acc[key].value += entry.amount;
    return acc;
  }, {});

  const rows = Object.values(totals).map((item) => ({ month: item.month, cardCompany: item.cardCompany, value: item.value }));
  const sortedRows = [...rows].sort((a, b) => {
    const result = a.value - b.value;
    return sortDescending ? -result : result;
  });

  sortedRows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.month}</td>
      <td>${row.cardCompany}</td>
      <td class="amount-cell">${formatCurrency(row.value)}</td>
    `;
    monthsBody.appendChild(tr);
  });
}

function rerunClassification() {
  if (!entries.length) {
    rulesStatus.textContent = 'No entries to reclassify yet.';
    return;
  }

  entries = entries.map((entry) => ({
    ...entry,
    category: classifyEntry(entry.description)
  }));

  syncCategoriesWithEntries();
  saveEntries();
  renderTable();
  rulesStatus.textContent = `Classification re-run complete for ${entries.length} entries.`;
}

function renderRulesList() {
  rulesBody.innerHTML = '';

  if (!rules.length) {
    rulesBody.innerHTML = '<tr><td colspan="3">No custom rules yet.</td></tr>';
    return;
  }

  rules.forEach((rule) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${rule.keyword}</td>
      <td>${rule.category}</td>
      <td><button class="remove-rule-btn" data-id="${rule.id}" type="button">Remove</button></td>
    `;
    rulesBody.appendChild(row);
  });
}

function renderBillsList() {
  billsBody.innerHTML = '';

  if (!bills.length) {
    billsStatus.textContent = 'No saved bills yet.';
    billsBody.innerHTML = '<tr><td colspan="5">No saved bills yet.</td></tr>';
    return;
  }

  billsStatus.textContent = `Loaded ${bills.length} saved bill${bills.length === 1 ? '' : 's'}.`;
  bills.forEach((bill) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${bill.date}</td>
      <td>${bill.company}</td>
      <td>
        <input class="bill-month-input" data-id="${bill.id}" type="text" value="${bill.month || 'Unknown'}" />
      </td>
      <td>${bill.entries}</td>
      <td>
        <button class="remove-bill-btn" data-id="${bill.id}" type="button">Delete</button>
      </td>
    `;
    billsBody.appendChild(row);
  });
}

function renderCategoryManager() {
  categoryManagerBody.innerHTML = '';

  if (!categories.length) {
    categoryManagerStatus.textContent = 'No categories yet.';
    categoryManagerBody.innerHTML = '<tr><td colspan="2">No categories yet.</td></tr>';
    return;
  }

  categoryManagerStatus.textContent = `Manage ${categories.length} category${categories.length === 1 ? '' : 'ies'}.`;
  categories.forEach((category) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${category}</td>
      <td>
        <button class="remove-category-btn" data-category="${category}" type="button">Remove</button>
      </td>
    `;
    categoryManagerBody.appendChild(row);
  });
}

function renderTable() {
  if (currentView === 'categories') {
    renderCategoryTable();
    entriesView.hidden = true;
    categoriesView.hidden = false;
    categoryManagerView.hidden = true;
    monthsView.hidden = true;
    billsView.hidden = true;
    rulesView.hidden = true;
  } else if (currentView === 'category-manager') {
    renderCategoryManager();
    entriesView.hidden = true;
    categoriesView.hidden = true;
    categoryManagerView.hidden = false;
    monthsView.hidden = true;
    billsView.hidden = true;
    rulesView.hidden = true;
  } else if (currentView === 'months') {
    renderMonthTable();
    entriesView.hidden = true;
    categoriesView.hidden = true;
    categoryManagerView.hidden = true;
    monthsView.hidden = false;
    billsView.hidden = true;
    rulesView.hidden = true;
  } else if (currentView === 'bills') {
    renderBillsList();
    entriesView.hidden = true;
    categoriesView.hidden = true;
    categoryManagerView.hidden = true;
    monthsView.hidden = true;
    billsView.hidden = false;
    rulesView.hidden = true;
  } else if (currentView === 'rules') {
    renderRulesList();
    entriesView.hidden = true;
    categoriesView.hidden = true;
    categoryManagerView.hidden = true;
    monthsView.hidden = true;
    billsView.hidden = true;
    rulesView.hidden = false;
  } else {
    renderEntriesTable();
    entriesView.hidden = false;
    categoriesView.hidden = true;
    categoryManagerView.hidden = true;
    monthsView.hidden = true;
    billsView.hidden = true;
    rulesView.hidden = true;
  }
}

async function parsePdf(file) {
  if (!file) return;

  const buffer = await file.arrayBuffer();
  const pdfjsLib = window.pdfjsLib;

  if (!pdfjsLib) {
    billsStatus.textContent = 'Unable to load the PDF viewer. Please refresh and try again.';
    return;
  }

  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  }

  try {
    const pdf = await pdfjsLib.getDocument({
      data: buffer,
      password: pdfPasswordInput ? pdfPasswordInput.value : ''
    }).promise;
    const textChunks = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .map((item) => ({ str: item.str, y: item.transform[5] }))
        .filter((item) => item.str && item.str.trim());

      const grouped = [];
      items.forEach((item) => {
        const yKey = Math.round(item.y * 10) / 10;
        const lastGroup = grouped[grouped.length - 1];

        if (lastGroup && Math.abs(lastGroup.y - yKey) < 0.5) {
          lastGroup.texts.push(item.str.trim());
        } else {
          grouped.push({ y: yKey, texts: [item.str.trim()] });
        }
      });

      textChunks.push(...grouped.map((group) => group.texts.join(' ').trim()).filter(Boolean));
    }

    const lines = buildLinesFromPdfText(textChunks.join('\n'));
    const company = file.name.replace(/\.pdf$/i, '') || 'Unknown company';
    const extractedBillDate = extractBillDateFromText(textChunks.join('\n'));
    const billDate = extractedBillDate ? formatDisplayDate(extractedBillDate) : 'Unknown';
    const month = getPreviousMonthLabel(extractedBillDate || billDate);
    const billId = Date.now().toString();
    const parsedEntries = extractCostEntries(lines).map((entry) => ({
      ...entry,
      billId,
      billDate: extractedBillDate || billDate,
      cardCompany: company,
      month
    }));

    entries = [...entries, ...parsedEntries];
    syncCategoriesWithEntries();

    const savedBill = {
      id: billId,
      date: billDate,
      month,
      company,
      entries: parsedEntries.length,
      data: parsedEntries
    };

    bills = [savedBill, ...bills];
    saveBills();
    saveEntries();
    renderTable();
    billsStatus.textContent = `Parsed ${parsedEntries.length} entries from ${company}.`;
  } catch (error) {
    console.error(error);
    if (error && error.name === 'PasswordException') {
      billsStatus.textContent = 'This PDF is password-protected. Please upload an unprotected PDF.';
    } else {
      billsStatus.textContent = 'Unable to read this PDF. Please try another file.';
    }
  }
}

parseButton.addEventListener('click', () => {
  if (!pdfInput.files.length) {
    return;
  }

  parsePdf(pdfInput.files[0]).catch((error) => {
    console.error(error);
  });
});

categoryManagerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const inputValue = newCategoryInput.value.trim();
  const normalizedCategory = inputValue.replace(/\s+/g, ' ');

  if (!normalizedCategory) return;

  if (!categories.some((category) => category.toLowerCase() === normalizedCategory.toLowerCase())) {
    categories.push(normalizedCategory);
    saveCategories();
    populateCategorySelectors();
    renderCategoryManager();
    normalizeCategoriesForEntries();
    renderTable();
    categoryManagerStatus.textContent = `Category “${normalizedCategory}” added.`;
  } else {
    categoryManagerStatus.textContent = `Category “${normalizedCategory}” already exists.`;
  }

  newCategoryInput.value = '';
});

categoryManagerBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-category]');
  if (!button) return;

  const categoryName = button.getAttribute('data-category');
  if (!categoryName) return;

  if (categoryName === 'Other') {
    categoryManagerStatus.textContent = 'The “Other” category cannot be removed.';
    return;
  }

  categories = categories.filter((category) => category !== categoryName);
  saveCategories();
  populateCategorySelectors();
  normalizeCategoriesForEntries();
  renderCategoryManager();
  renderTable();
  categoryManagerStatus.textContent = `Category “${categoryName}” removed.`;
});

rulesForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const keyword = ruleKeyword.value.trim();
  const category = ruleCategory.value;

  if (!keyword) return;

  const normalizedKeyword = keyword.toLowerCase();
  const existingRule = rules.find((rule) => rule.keyword.toLowerCase() === normalizedKeyword);

  if (existingRule) {
    existingRule.keyword = keyword;
    existingRule.category = category;
  } else {
    rules.push({ id: Date.now().toString(), keyword, category });
  }

  saveRules();
  ruleKeyword.value = '';
  ruleCategory.value = 'Food';
  rerunClassification();
  rulesStatus.textContent = existingRule
    ? `Rule updated for “${keyword}”.`
    : `Rule added for “${keyword}”.`;
});

rerunRulesButton.addEventListener('click', rerunClassification);

rulesBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;

  const id = button.getAttribute('data-id');
  rules = rules.filter((rule) => rule.id !== id);
  saveRules();
  rerunClassification();
  rulesStatus.textContent = 'Rule removed.';
});

billsBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;

  const id = button.getAttribute('data-id');
  const action = button.classList.contains('remove-bill-btn') ? 'delete' : 'delete';

  if (action === 'delete') {
    bills = bills.filter((bill) => bill.id !== id);
    entries = entries.filter((entry) => entry.billId !== id);
    saveBills();
    saveEntries();
    renderTable();
  }
});

billsBody.addEventListener('change', (event) => {
  const input = event.target.closest('input.bill-month-input');
  if (!input) return;

  const id = input.getAttribute('data-id');
  const newMonth = input.value.trim();

  const bill = bills.find((item) => item.id === id);
  if (!bill) return;

  bill.month = newMonth || 'Unknown';
  bill.data = (bill.data || []).map((entry) => ({
    ...entry,
    month: bill.month
  }));

  entries = entries.map((entry) => {
    if (entry.billId === id) {
      return { ...entry, month: bill.month };
    }
    return entry;
  });

  saveBills();
  saveEntries();
  renderTable();
  billsStatus.textContent = `Updated month for ${bill.company}.`;
});

sortHeaders.forEach((header) => {
  header.addEventListener('click', () => {
    if (header.dataset.sort === 'amount' || header.dataset.sort === 'category-amount') {
      currentSort = header.dataset.sort === 'category-amount' ? 'category-amount' : 'amount';
    }

    sortDescending = !sortDescending;
    renderTable();
  });
});

categoryFilter.addEventListener('change', () => {
  renderTable();
});

companyFilter.addEventListener('change', () => {
  renderTable();
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    currentView = tab.dataset.view;
    tabs.forEach((item) => item.classList.toggle('active', item === tab));
    renderTable();
  });
});

loadCategories();
populateCategorySelectors();
loadRules();
loadBills();
loadEntries();
normalizeCategoriesForEntries();
populateCategorySelectors();
populateCompanyFilter();
saveEntries();
renderTable();
