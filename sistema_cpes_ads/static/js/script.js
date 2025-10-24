(function () {
  'use strict';

  (function themeController() {
    const root = document.documentElement;
    const ok = (t) => (t === 'light' || t === 'dark') ? t : 'light';
    const sysPrefersDark = () => window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    function computeInitial() { try {
      const s = (localStorage.getItem('theme') || '').toLowerCase();
      if (s === 'light' || s === 'dark') return s;
    } catch(_){} return sysPrefersDark() ? 'dark' : 'light'; }
    function current(){ return ok(root.getAttribute('data-theme') || computeInitial()); }
    function apply(t){ t=ok(t); root.setAttribute('data-theme',t); root.style.colorScheme=t;
      try{localStorage.setItem('theme',t);}catch(_){} 
      document.querySelectorAll('#themeToggle, #themeToggleLogin').forEach(b=>b?.setAttribute('aria-pressed', t==='dark'?'true':'false'));
    }
    apply(current());
    ['themeToggle','themeToggleLogin'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>apply(current()==='dark'?'light':'dark')));
    if (window.matchMedia){
      const mq = matchMedia('(prefers-color-scheme: dark)');
      (mq.addEventListener||mq.addListener).call(mq,'change',e=>{
        const saved=(localStorage.getItem('theme')||'').toLowerCase();
        if (saved!=='light'&&saved!=='dark') apply(e.matches?'dark':'light');
      });
    }
  })();

  // ===== DOM =====
  const dom = {
    form: document.getElementById('formCadastro'),
    msg: document.getElementById('mensagem'),
    btnCadastrar: document.getElementById('btnCadastrar'),
    btnAtualizar: document.getElementById('btnAtualizar'),
    btnExportar: document.getElementById('btnExportar'),
    filtroCliente: document.getElementById('filtroCliente'),
    filtroModelo: document.getElementById('filtroModelo'),
    filtroStatus: document.getElementById('filtroStatus'),
    categoriaFilters: document.getElementById('categoriaFilters'),
    buscaGeral: document.getElementById('buscaGeral'),
    tabelaCPEsBody: document.querySelector('#tabelaCPEs tbody'),
    tabelaStatus: document.querySelector('#tabelaStatus tbody') || document.getElementById('tabelaStatus'),
    disponibilidadeCanvas: document.getElementById('disponibilidadeChart'),

    statusProgressBar: document.getElementById('statusProgressBar'),
    statusProgressValue: document.getElementById('statusProgressValue'),
    avgDisponibilidade: document.getElementById('avgDisponibilidade'),
    riscoCount: document.getElementById('riscoCount'),
    statusPie: document.getElementById('statusPie'),
    categoriaPie: document.getElementById('categoriaPie'),
    topOfflineChart: document.getElementById('topOfflineChart'),
  };

  let equipamentosCache = [];
  let lastStatusCache = [];
  let availabilityCache = [];
  const statusCache = new Map();

  function el(tag, attrs = {}, html = '') {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'dataset') Object.entries(v||{}).forEach(([dk,dv]) => e.dataset[dk]=dv);
      else if (k in e) e[k]=v; else e.setAttribute(k,v);
    });
    if (html) e.innerHTML = html; return e;
  }
  function msg(texto, ok = true) {
    if (!dom.msg) return; dom.msg.textContent = texto;
    dom.msg.className = ok ? 'success' : 'error';
    dom.msg.classList.remove('hidden'); clearTimeout(dom.msg.__timeout);
    dom.msg.__timeout = setTimeout(() => dom.msg.classList.add('hidden'), 5000);
  }
  async function fetchJSON(url, options = {}) {
    const resp = await fetch(url, { headers:{'Content-Type':'application/json'}, ...options });
    let data=null; try{ data=await resp.json(); }catch(_){}
    if (!resp.ok) throw new Error((data&&(data.error||data.message))||`Erro HTTP ${resp.status}`);
    return data;
  }
  const formatCPF_CNPJ = (v) => (v||'').replace(/[^\d]/g,'');
  function categoriaDoEquipamento(eq){
    const m = (`${eq?.modelo||''} ${eq?.descricao||''} ${eq?.serial_number||''}`).toLowerCase();
    if (/\bonu\b|gpon|epon|hgu|zxa/i.test(m)) return 'ONU';
    if (/roteador|router|mikrotik|tp[- ]?link|asus|wifi|ax\d|cpe\b|wr-|rt-/i.test(m)) return 'Roteador';
    return 'Geral';
  }
  function statusClass(status){
    const s=(status||'').toLowerCase();
    if (s.startsWith('online')) return 'online';
    if (s.startsWith('offline')) return 'offline';
    if (s.startsWith('timeout')) return 'timeout';
    if (s.startsWith('erro')) return 'erro';
    return '';
  }
  const confirmar = (q) => { try { return window.confirm(q); } catch(_) { return true; } };

  function popularFiltros(equipamentos){
    if (dom.filtroCliente){
      const set=new Set(['']); equipamentos.forEach(e=>e.nome_cliente&&set.add(e.nome_cliente));
      preencherSelect(dom.filtroCliente,[...set].sort(),'Todos os clientes');
    }
    if (dom.filtroModelo){
      const set=new Set(['']); equipamentos.forEach(e=>e.modelo&&set.add(e.modelo));
      preencherSelect(dom.filtroModelo,[...set].sort(),'Todos os modelos');
    }
    if (dom.filtroStatus){
      preencherSelect(dom.filtroStatus, ['', 'Online','Offline','Timeout','Erro'], 'Todos os status');
    }
  }
  function preencherSelect(sel, valores, first){ if(!sel) return; sel.innerHTML='';
    valores.forEach((v,i)=> sel.appendChild(el('option',{value:v}, i===0&&first?first:v)));
  }
  function aplicaFiltrosEmLinha(tr){
    const clienteSel = dom.filtroCliente?.value || '';
    const modeloSel  = dom.filtroModelo?.value  || '';
    const statusSel  = dom.filtroStatus?.value  || '';
    const catBtnAtivo = dom.categoriaFilters?.querySelector('button[aria-pressed="true"]');
    const categoriaSel = catBtnAtivo ? catBtnAtivo.dataset.cat : 'all';
    const busca = (dom.buscaGeral?.value.trim().toLowerCase()) || '';

    const cliente = tr.dataset.cliente || '';
    const modelo  = tr.dataset.modelo  || '';
    const ip      = tr.dataset.ip      || '';
    const categoria = tr.dataset.categoria || '';
    const status = (statusCache.get(ip) || '').toLowerCase();

    const passCliente = !clienteSel || cliente === clienteSel;
    const passModelo  = !modeloSel  || modelo  === modeloSel;
    const passStatus  = !statusSel  || status.startsWith(statusSel.toLowerCase());
    const passCat     = categoriaSel === 'all' || categoria === categoriaSel;
    const passBusca   = !busca || [cliente, modelo, ip, categoria].some(x => (x||'').toLowerCase().includes(busca));
    tr.hidden = !(passCliente && passModelo && passStatus && passCat && passBusca);
  }
  function aplicarFiltrosGlobais(){ dom.tabelaCPEsBody?.querySelectorAll('tr').forEach(aplicaFiltrosEmLinha); }
  function initFiltrosUI(){
    dom.filtroCliente?.addEventListener('change', aplicarFiltrosGlobais);
    dom.filtroModelo ?.addEventListener('change', aplicarFiltrosGlobais);
    dom.filtroStatus ?.addEventListener('change', aplicarFiltrosGlobais);
    dom.buscaGeral   ?.addEventListener('input',  aplicarFiltrosGlobais);
    dom.categoriaFilters?.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('button.pill'); if(!btn) return;
      dom.categoriaFilters.querySelectorAll('button.pill').forEach(b=>b.setAttribute('aria-pressed','false'));
      btn.setAttribute('aria-pressed','true'); aplicarFiltrosGlobais();
    });
  }

  function renderEquipamentos(equipamentos){
    equipamentosCache = equipamentos.slice(0);
    popularFiltros(equipamentosCache);
    const tbody = dom.tabelaCPEsBody; if(!tbody) return; tbody.innerHTML='';

    equipamentosCache.forEach(eq=>{
      const cat=categoriaDoEquipamento(eq);
      const id=eq.id_cpe ?? eq.id ?? '';
      const tr=el('tr',{dataset:{cliente:eq.nome_cliente||'', modelo:eq.modelo||'', ip:eq.ip_local||'', categoria:cat, id}});
      const statusHtml = `<span class="status-cell" data-ip="${eq.ip_local||''}">Verificando...</span>`;
      const actionsHtml=`
        <div class="acoes">
          <button type="button" class="btn btn--icon" data-action="verificar" title="Verificar status" aria-label="Verificar status" data-ip="${eq.ip_local||''}">🔄</button>
          <button type="button" class="btn btn--icon" data-action="remover"   title="Remover" aria-label="Remover" data-id="${id}">🗑️</button>
        </div>`;
      tr.innerHTML=`
        <td>${eq.serial_number||''}</td>
        <td>${eq.modelo||''}</td>
        <td><span class="chip ${cat==='ONU'?'chip--onu':(cat==='Roteador'?'chip--roteador':'')}">${cat}</span></td>
        <td>${eq.nome_cliente||''}</td>
        <td>${eq.ip_local||''}</td>
        <td>${statusHtml}</td>
        <td>${actionsHtml}</td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-action="remover"]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.dataset.id; if(!id) return;
        if (!confirmar('Deseja mesmo excluir este equipamento?')) return;
        try { await fetchJSON(`/api/equipamentos/${id}`,{method:'DELETE'});
          msg('Equipamento removido.', true); await atualizarTudo();
        } catch(e){ msg(e.message||'Erro ao remover.', false); }
      });
    });
    tbody.querySelectorAll('[data-action="verificar"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const ip=btn.dataset.ip; const target=btn.closest('tr')?.querySelector('.status-cell');
        if(ip && target) verificarStatus(ip, target);
      });
    });
    tbody.querySelectorAll('.status-cell[data-ip]').forEach(elm=>{
      const ip=elm.dataset.ip; if(ip) verificarStatus(ip, elm);
    });

    updateDashboardVisuals();
  }

  async function carregarEquipamentos(){
    try {
      const data = await fetchJSON('/api/equipamentos');
      renderEquipamentos(Array.isArray(data)?data:[]);
    } catch(e){ msg('Erro ao carregar equipamentos: '+(e.message||e), false); }
  }

  // ===== STATUS =====
  async function verificarStatus(ip, statusEl){
    if(!ip||!statusEl) return;
    statusEl.textContent='Verificando...';
    statusEl.classList.remove('online','offline','timeout','erro','loading');
    statusEl.classList.add('loading');
    try {
      const data = await fetchJSON(`/api/status_cpe/${encodeURIComponent(ip)}`);
      const label = data.status || 'Desconhecido';
      statusCache.set(ip, label);
      statusEl.textContent=label; statusEl.classList.remove('loading');
      const cls=statusClass(label); if(cls) statusEl.classList.add(cls);
      if (dom.filtroStatus?.value){ const tr=statusEl.closest('tr'); if(tr) aplicaFiltrosEmLinha(tr); }
    } catch(e){
      statusEl.textContent='Erro'; statusEl.classList.remove('loading'); statusEl.classList.add('erro');
      statusCache.set(ip,'Erro');
    }
  }

  // ===== DASH Tabela de últimos status =====
  async function carregarUltimosStatus(){
    if(!dom.tabelaStatus) return;
    const tbody = dom.tabelaStatus.tagName==='TBODY' ? dom.tabelaStatus : (dom.tabelaStatus.querySelector('tbody')||dom.tabelaStatus);
    tbody.innerHTML='';
    try{
      const data = await fetchJSON('/api/dashboard/last_status');
      lastStatusCache = Array.isArray(data)?data:[];
      lastStatusCache.forEach(r=>{
        const cat=categoriaDoEquipamento(r);
        tbody.appendChild(el('tr',{},`
          <td>${r.serial_number||''}</td>
          <td>${r.modelo||''}</td>
          <td>${cat}</td>
          <td>${r.nome_cliente||''}</td>
          <td>${r.ip_local||''}</td>
          <td>${r.status||'Sem dado'}</td>`));
      });
    } catch(_) {}
    updateDashboardVisuals();
  }

  // ===== DASH Disponibilidade =====
  let disponibilidadeChart=null, statusPieChart=null, categoriaPieChart=null, topOfflineChart=null;
  async function carregarDisponibilidade(){
    if(!dom.disponibilidadeCanvas || !window.Chart) return;
    try{
      const data = await fetchJSON('/api/dashboard/availability?days=7');
      availabilityCache = Array.isArray(data)?data:[];
      const labels = availabilityCache.map(d=>d.serial_number);
      const valores = availabilityCache.map(d=>Number(d.disponibilidade_pct||0));

      if (disponibilidadeChart){
        disponibilidadeChart.data.labels=labels;
        disponibilidadeChart.data.datasets[0].data=valores;
        disponibilidadeChart.update();
      } else {
        const ctx = dom.disponibilidadeCanvas.getContext('2d');
        disponibilidadeChart = new Chart(ctx, {
          type:'bar',
          data:{ labels, datasets:[{ label:'Disponibilidade (%)', data:valores }] },
          options:{ responsive:true, scales:{ y:{ beginAtZero:true, max:100 } } }
        });
      }
    } catch(e){ console.error('Erro ao carregar disponibilidade:',e); }
    updateDashboardVisuals();
  }

  function updateDashboardVisuals(){
    const total = (equipamentosCache.length || lastStatusCache.length || 0);
    const online = lastStatusCache.filter(x => (x.status||'').toLowerCase()==='online').length;
    const offline = Math.max(0, total - online);

    const kTot=document.getElementById('kpiTotal'); if(kTot) kTot.textContent=total;
    const kOn =document.getElementById('kpiOnline'); if(kOn)  kOn.textContent=online;
    const kOff=document.getElementById('kpiOffline');if(kOff) kOff.textContent=offline;

    if (dom.statusProgressBar && dom.statusProgressValue){
      const pct = total ? Math.round(online*100/total) : 0;
      dom.statusProgressBar.style.width = pct + '%';
      dom.statusProgressValue.textContent = pct + '%';
    }

    if (dom.avgDisponibilidade){
      if (availabilityCache.length){
        const avg = Math.round(availabilityCache.reduce((a,b)=>a+Number(b.disponibilidade_pct||0),0)/availabilityCache.length);
        dom.avgDisponibilidade.textContent = avg + '%';
      } else dom.avgDisponibilidade.textContent = '—';
    }
    if (dom.riscoCount){
      if (availabilityCache.length){
        const risk = availabilityCache.filter(d => Number(d.disponibilidade_pct||0) < 95).length;
        dom.riscoCount.textContent = String(risk);
      } else dom.riscoCount.textContent = '—';
    }

    if (dom.statusPie && window.Chart){
      const data = {
        labels:['Online','Offline/Timeout'],
        datasets:[{ data:[online, Math.max(0,total-online)] }]
      };
      if (statusPieChart){ statusPieChart.data=data; statusPieChart.update(); }
      else statusPieChart = new Chart(dom.statusPie.getContext('2d'), { type:'doughnut', data, options:{ responsive:true, cutout:'60%' } });
    }

    if (dom.categoriaPie && window.Chart){
      const counts = { ONU:0, Roteador:0, Geral:0 };
      equipamentosCache.forEach(eq => counts[categoriaDoEquipamento(eq)]++);
      const data = { labels:['ONU','Roteador','Geral'], datasets:[{ data:[counts.ONU, counts.Roteador, counts.Geral] }] };
      if (categoriaPieChart){ categoriaPieChart.data=data; categoriaPieChart.update(); }
      else categoriaPieChart = new Chart(dom.categoriaPie.getContext('2d'), { type:'doughnut', data, options:{ responsive:true, cutout:'60%' } });
    }

    if (dom.topOfflineChart && window.Chart){
      const rows = availabilityCache
        .slice(0)
        .sort((a,b)=>Number(a.disponibilidade_pct||0)-Number(b.disponibilidade_pct||0))
        .slice(0,5);
      const labels = rows.map(r=>r.serial_number);
      const dados  = rows.map(r=>Math.max(0, 100 - Number(r.disponibilidade_pct||0))); // “quanto falta” pra 100
      const data = { labels, datasets:[{ label:'Indisponibilidade (p.p.)', data:dados }] };
      if (topOfflineChart){ topOfflineChart.data=data; topOfflineChart.update(); }
      else topOfflineChart = new Chart(dom.topOfflineChart.getContext('2d'), {
        type:'bar', data,
        options:{ indexAxis:'y', responsive:true, scales:{ x:{ beginAtZero:true, max:100 } } }
      });
    }
  }

  if (dom.form){
    dom.form.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      if (!confirmar('Deseja mesmo cadastrar este equipamento?')) return;

      const payload = {
        nome_cliente : dom.form.nome_cliente?.value?.trim() || '',
        cpf_cnpj     : formatCPF_CNPJ(dom.form.cpf_cnpj?.value?.trim() || ''),
        endereco     : dom.form.endereco?.value?.trim() || '',
        telefone     : dom.form.telefone?.value?.trim() || '',
        serial_number: dom.form.serial_number?.value?.trim() || '',
        modelo       : dom.form.modelo?.value?.trim() || '',
        ip_local     : dom.form.ip_local?.value?.trim() || '',
      };
      const obrig=['nome_cliente','cpf_cnpj','endereco','serial_number','modelo','ip_local'];
      const faltando=obrig.filter(k=>!payload[k]); if(faltando.length) return msg('Preencha: '+faltando.join(', '), false);

      dom.btnCadastrar?.setAttribute('disabled','true'); dom.btnCadastrar?.setAttribute('aria-busy','true');
      try{
        await fetchJSON('/api/equipamentos', { method:'POST', body:JSON.stringify(payload) });
        msg('Equipamento cadastrado com sucesso!', true);
        dom.form.reset(); await atualizarTudo();
      } catch(e){ msg(e.message||'Erro ao cadastrar.', false); }
      finally{ dom.btnCadastrar?.removeAttribute('disabled'); dom.btnCadastrar?.removeAttribute('aria-busy'); }
    });
  }

  dom.btnAtualizar?.addEventListener('click', async ()=>{
    dom.btnAtualizar.setAttribute('aria-busy','true');
    try{ await atualizarTudo(); } finally{ dom.btnAtualizar.removeAttribute('aria-busy'); }
  });
  dom.btnExportar?.addEventListener('click', ()=>{ window.location.href='/api/equipamentos/export.csv'; });

  document.addEventListener('keydown', (e)=>{
    const tag=(e.target&&e.target.tagName||'').toLowerCase();
    if (tag==='input'||tag==='textarea') return;
    if (e.altKey && e.key.toLowerCase()==='r'){ e.preventDefault(); dom.btnAtualizar?.click(); }
    if (e.altKey && e.key.toLowerCase()==='e'){ e.preventDefault(); dom.btnExportar?.click(); }
  });

  // ===== BOOT =====
  function atualizarTudo(){ return Promise.all([carregarEquipamentos(), carregarUltimosStatus(), carregarDisponibilidade()]); }
  function boot(){ initFiltrosUI(); atualizarTudo(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
