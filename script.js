const routeInput = document.getElementById('routeInput');
const searchBtn = document.getElementById('searchBtn');
const directionTabs = document.getElementById('directionTabs');
const stopsContainer = document.getElementById('stopsContainer');
const etaContainer = document.getElementById('etaContainer');
const errorMessage = document.getElementById('errorMessage');

let currentRoute = '';
let routeData = [];
let selectedDirection = null;
let stopDetailsCache = new Map();

const apiBase = 'https://data.etabus.gov.hk/v1/transport/kmb';

function showError(message) {
  errorMessage.textContent = message || '';
}

function normalizeRoute(value) {
  return value.trim().toUpperCase();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`無法取得資料 (${response.status})`);
  }
  return response.json();
}

function renderTabs(routes) {
  directionTabs.innerHTML = '';
  routes.forEach((item, index) => {
    const tab = document.createElement('button');
    tab.className = `tab${index === 0 ? ' active' : ''}`;
    tab.textContent = `${item.orig_tc} → ${item.dest_tc}`;
    tab.dataset.bound = item.bound;
    tab.dataset.service = item.service_type;
    tab.addEventListener('click', () => {
      Array.from(directionTabs.children).forEach((child) => child.classList.remove('active'));
      tab.classList.add('active');
      selectedDirection = { bound: item.bound, serviceType: item.service_type };
      renderStops();
    });
    directionTabs.appendChild(tab);
  });
  selectedDirection = { bound: routes[0].bound, serviceType: routes[0].service_type };
}

async function searchRoute() {
  const route = normalizeRoute(routeInput.value);
  etaContainer.innerHTML = '';
  stopsContainer.innerHTML = '';
  showError('');

  if (!route) {
    showError('請輸入巴士號碼');
    return;
  }

  try {
    const data = await fetchJson(`${apiBase}/route/${route}`);
    if (!data.data || data.data.length === 0) {
      showError('找不到此路線，請確認巴士號碼');
      return;
    }

    currentRoute = route;
    routeData = data.data;
    renderTabs(routeData);
    await renderStops();
  } catch (error) {
    showError(error.message || '查詢時發生錯誤');
  }
}

async function renderStops() {
  etaContainer.innerHTML = '';
  stopsContainer.innerHTML = '';
  if (!selectedDirection) return;

  const { bound, serviceType } = selectedDirection;
  const header = document.createElement('div');
  header.className = 'stop-card-header';
  header.innerHTML = `<h3>車站列表</h3><p class="hint">點擊車站以查看到站時間</p>`;
  stopsContainer.appendChild(header);

  try {
    const data = await fetchJson(`${apiBase}/route-stop/${currentRoute}/${bound}/${serviceType}`);
    const stops = data.data || [];
    if (stops.length === 0) {
      stopsContainer.innerHTML = '<p class="eta-empty">未能取得車站資料</p>';
      return;
    }

    const frag = document.createDocumentFragment();
    const template = document.getElementById('stopItemTemplate');

    for (let i = 0; i < stops.length; i += 1) {
      const stop = stops[i];
      const stopDetails = await getStopDetails(stop.stop);
      const node = template.content.cloneNode(true);
      const btn = node.querySelector('.stop-item');
      const name = document.createElement('div');
      name.className = 'stop-name';
      name.textContent = stopDetails.name_tc || stopDetails.name_en || stop.stop;
      const index = document.createElement('div');
      index.className = 'stop-index';
      index.textContent = `#${i + 1}`;

      btn.appendChild(name);
      btn.appendChild(index);
      btn.addEventListener('click', () => loadEta(stop.stop));
      frag.appendChild(node);
    }
    stopsContainer.appendChild(frag);
  } catch (error) {
    stopsContainer.innerHTML = `<p class="error">${error.message || '無法載入車站列表'}</p>`;
  }
}

async function getStopDetails(stopId) {
  if (stopDetailsCache.has(stopId)) {
    return stopDetailsCache.get(stopId);
  }
  const data = await fetchJson(`${apiBase}/stop/${stopId}`);
  const detail = data.data || {};
  stopDetailsCache.set(stopId, detail);
  return detail;
}

function formatEta(etaString) {
  if (!etaString) return { text: '暫時未有班次', minutes: null };
  const etaTime = new Date(etaString);
  const now = new Date();
  const diffMinutes = Math.max(0, Math.round((etaTime - now) / 60000));
  const formatted = etaTime.toLocaleTimeString('zh-Hant', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return { text: `${formatted}（${diffMinutes} 分鐘）`, minutes: diffMinutes };
}

async function loadEta(stopId) {
  etaContainer.innerHTML = '<p class="hint">載入中...</p>';
  try {
    const data = await fetchJson(`${apiBase}/stop-eta/${stopId}/${currentRoute}/${selectedDirection.serviceType}`);
    const etas = data.data || [];
    const template = document.getElementById('etaItemTemplate');

    etaContainer.innerHTML = '<h3>預計到站時間</h3>';

    if (etas.length === 0) {
      etaContainer.innerHTML += '<p class="eta-empty">暫時未有到站資料</p>';
      return;
    }

    const frag = document.createDocumentFragment();
    etas.forEach((item) => {
      const { text } = formatEta(item.eta);
      const row = template.content.cloneNode(true);
      row.querySelector('.eta-time').textContent = text;
      row.querySelector('.eta-remark').textContent = item.rmk_tc || item.rmk_sc || '';
      frag.appendChild(row);
    });

    etaContainer.appendChild(frag);
  } catch (error) {
    etaContainer.innerHTML = `<p class="error">${error.message || '無法取得到站時間'}</p>`;
  }
}

searchBtn.addEventListener('click', searchRoute);
routeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    searchRoute();
  }
});

routeInput.focus();

