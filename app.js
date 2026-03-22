// ============================================================
// KuraNext — Supabase対応 共通ロジック
// ============================================================

// ── Supabase設定（ここだけ書き換える） ──────────────────────
const SUPABASE_URL = 'https://wbsvyqbvlpfhlvqdxbnx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indic3Z5cWJ2bHBmaGx2cWR4Ym54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNjE4OTksImV4cCI6MjA4OTYzNzg5OX0.MfaAFEV4DZ2CM1ftA9gh_KpupNQ144amiSljux6kbuE';

// Supabase JS SDK（CDN）
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── ユーティリティ ────────────────────────────────────────
function uid() { return crypto.randomUUID(); }

function formatDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function formatMoney(n) { return '¥' + Number(n).toLocaleString(); }
function calcWorkHours(i, o, b = 60) {
  if (!i || !o) return 0;
  const [ih, im] = i.split(':').map(Number);
  const [oh, om] = o.split(':').map(Number);
  return Math.max(0, ((oh * 60 + om) - (ih * 60 + im) - b) / 60);
}

// ── トースト ──────────────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
}

// ── 認証 ─────────────────────────────────────────────────
const Auth = {
  _session: null,
  _profile: null,

  async init() {
    const { data } = await sb.auth.getSession();
    this._session = data.session;
    if (this._session) {
      await this._loadProfile();
    }
    // セッション変化を監視
    sb.auth.onAuthStateChange(async (event, session) => {
      this._session = session;
      if (session) await this._loadProfile();
      else this._profile = null;
    });
    return this._session;
  },

  async _loadProfile() {
    const { data } = await sb.from('profiles')
      .select('*, tenant:tenants(id,name,plan,status)')
      .eq('id', this._session.user.id)
      .single();
    this._profile = data;
    return data;
  },

  async login(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    this._session = data.session;
    await this._loadProfile();
    return { session: data.session, profile: this._profile };
  },

  async logout() {
    await sb.auth.signOut();
    location.href = 'index.html';
  },

  session() { return this._session; },
  profile() { return this._profile; },
  tenantId() { return this._profile?.tenant_id; },
  role() { return this._profile?.role; },
  userId() { return this._session?.user?.id; },

  async requireInit(allowedRoles) {
    const session = await this.init();
    if (!session) { location.href = 'index.html'; return false; }
    if (allowedRoles && !allowedRoles.includes(this.role())) {
      location.href = 'index.html'; return false;
    }
    return true;
  }
};

// ── Supabase DB操作ヘルパー ───────────────────────────────
const DB = {
  // テナント
  async getTenant(id) {
    const { data } = await sb.from('tenants').select('*').eq('id', id).single();
    return data;
  },
  async getAllTenants() {
    const { data } = await sb.from('tenants').select('*').order('created_at');
    return data || [];
  },
  async upsertTenant(data) {
    const { data: r, error } = await sb.from('tenants').upsert(data).select().single();
    if (error) throw error;
    return r;
  },
  async deleteTenant(id) {
    await sb.from('tenants').delete().eq('id', id);
  },

  // プロフィール
  async getProfile(id) {
    const { data } = await sb.from('profiles').select('*, tenant:tenants(*)').eq('id', id).single();
    return data;
  },
  async getTenantProfiles(tenantId) {
    const { data } = await sb.from('profiles').select('*').eq('tenant_id', tenantId).order('created_at');
    return data || [];
  },
  async getAllProfiles() {
    const { data } = await sb.from('profiles').select('*, tenant:tenants(name)').neq('role', 'master').order('created_at');
    return data || [];
  },
  async updateProfile(id, patch) {
    const { data, error } = await sb.from('profiles').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteProfile(id) {
    // auth userも削除（admin API不要、RLSでcascade）
    await sb.from('profiles').delete().eq('id', id);
  },

  // プロジェクト
  async getProjects(tenantId) {
    const q = sb.from('projects').select('*').order('created_at', { ascending: false });
    if (tenantId) q.eq('tenant_id', tenantId);
    const { data } = await q;
    return data || [];
  },
  async upsertProject(data) {
    const { data: r, error } = await sb.from('projects').upsert(data).select().single();
    if (error) throw error;
    return r;
  },
  async deleteProject(id) { await sb.from('projects').delete().eq('id', id); },
  async incrementPhotoCount(projectId) {
    await sb.rpc('increment_photo_count', { project_id: projectId }).catch(() => {
      // fallback
      sb.from('projects').select('photo_count').eq('id', projectId).single().then(({ data }) => {
        if (data) sb.from('projects').update({ photo_count: data.photo_count + 1 }).eq('id', projectId);
      });
    });
  },

  // 写真
  async getPhotos(tenantId, filters = {}) {
    let q = sb.from('photos').select('*').order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    if (filters.projectId) q = q.eq('project_id', filters.projectId);
    if (filters.uploadedBy) q = q.eq('uploaded_by', filters.uploadedBy);
    if (filters.status) q = q.eq('status', filters.status);
    const { data } = await q;
    return data || [];
  },
  async insertPhoto(data) {
    const { data: r, error } = await sb.from('photos').insert(data).select().single();
    if (error) throw error;
    return r;
  },
  async updatePhoto(id, patch) {
    const { data, error } = await sb.from('photos').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deletePhoto(id) { await sb.from('photos').delete().eq('id', id); },

  // スケジュール
  async getSchedules(tenantId, projectId) {
    let q = sb.from('schedules').select('*').order('start_date');
    if (tenantId) q = q.eq('tenant_id', tenantId);
    if (projectId) q = q.eq('project_id', projectId);
    const { data } = await q;
    return data || [];
  },
  async upsertSchedule(data) {
    const { data: r, error } = await sb.from('schedules').upsert(data).select().single();
    if (error) throw error;
    return r;
  },
  async deleteSchedule(id) { await sb.from('schedules').delete().eq('id', id); },

  // 勤怠
  async getAttendance(tenantId, filters = {}) {
    let q = sb.from('attendance').select('*').order('date', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    if (filters.userId) q = q.eq('user_id', filters.userId);
    if (filters.month) q = q.like('date', filters.month + '%');
    const { data } = await q;
    return data || [];
  },
  async getTodayAttendance(userId) {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await sb.from('attendance').select('*').eq('user_id', userId).eq('date', today).maybeSingle();
    return data;
  },
  async upsertAttendance(data) {
    const { data: r, error } = await sb.from('attendance').upsert(data, { onConflict: 'user_id,date' }).select().single();
    if (error) throw error;
    return r;
  },
  async deleteAttendance(id) { await sb.from('attendance').delete().eq('id', id); },

  // 経理
  async getLedger(tenantId, filters = {}) {
    let q = sb.from('ledger').select('*').order('date', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    if (filters.type) q = q.eq('type', filters.type);
    if (filters.projectId) q = q.eq('project_id', filters.projectId);
    const { data } = await q;
    return data || [];
  },
  async upsertLedger(data) {
    const { data: r, error } = await sb.from('ledger').upsert(data).select().single();
    if (error) throw error;
    return r;
  },
  async deleteLedger(id) { await sb.from('ledger').delete().eq('id', id); },
};

// ── ストレージ ────────────────────────────────────────────
const Storage = {
  async uploadPhoto(tenantId, file) {
    const ext = file.name.split('.').pop();
    const path = `${tenantId}/${uid()}.${ext}`;
    const { error } = await sb.storage.from('photos').upload(path, file, { upsert: false });
    if (error) throw error;
    return path;
  },
  async getSignedUrl(path, expiresIn = 3600) {
    const { data } = await sb.storage.from('photos').createSignedUrl(path, expiresIn);
    return data?.signedUrl || null;
  },
  async deletePhoto(path) {
    await sb.storage.from('photos').remove([path]);
  }
};

// ── AI 分析 ───────────────────────────────────────────────
const AI = {
  async analyzePhoto(file) {
    // ファイルをbase64に変換
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file);
    });
    const apiKey = localStorage.getItem('kn_apikey');
    if (!apiKey) return this._mockPhoto();
    const base64 = dataUrl.split(',')[1];
    const mediaType = file.type || 'image/jpeg';
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 300,
          system: '建設工事写真分析AI。{"tags":["タグ1","タグ2"],"status":"ok|check|ng","note":"コメント"} のJSONのみ返してください。',
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'この建設写真を分析してJSONで返してください。' }
          ]}]
        })
      });
      const data = await res.json();
      return JSON.parse((data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim());
    } catch { return this._mockPhoto(); }
  },

  async classifyLedger(description, amount) {
    const apiKey = localStorage.getItem('kn_apikey');
    if (!apiKey) return this._mockLedger(description);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 150,
          system: '建設業経費仕訳AI。{"category":"勘定科目","type":"expense|income","note":""} のJSONのみ返してください。勘定科目:材料費,外注費,労務費,消耗品費,交通費,接待交際費,地代家賃,売上,雑収入,経費',
          messages: [{ role: 'user', content: `摘要:${description} 金額:${amount}円` }]
        })
      });
      const data = await res.json();
      return JSON.parse((data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim());
    } catch { return this._mockLedger(description); }
  },

  _mockPhoto() {
    return [
      { tags: ['基礎工事','配筋','鉄筋'], status: 'ok',    note: '配筋状況良好。' },
      { tags: ['躯体工事','型枠'],         status: 'check', note: '型枠確認が必要。' },
      { tags: ['内装工事','クロス'],        status: 'ok',    note: 'クロス施工完了。' },
      { tags: ['外構','コンクリート'],      status: 'ok',    note: '養生中。' },
      { tags: ['屋根工事','防水'],          status: 'ng',    note: '防水シートめくれ。要補修。' },
    ][Math.floor(Math.random() * 5)];
  },
  _mockLedger(desc) {
    const map = [
      ['コンクリート|セメント|木材|鉄筋|合板', '材料費',     'expense'],
      ['外注|委託|下請',                       '外注費',     'expense'],
      ['ガソリン|高速|交通|駐車',              '交通費',     'expense'],
      ['工具|消耗|ネジ',                       '消耗品費',   'expense'],
      ['接待|会食|飲食',                       '接待交際費', 'expense'],
      ['入金|請負|売上',                       '売上',       'income'],
    ];
    for (const [pat, cat, type] of map) if (new RegExp(pat).test(desc)) return { category: cat, type, note: '' };
    return { category: '経費', type: 'expense', note: '' };
  }
};

// ── スタッフ招待（メール送信） ────────────────────────────
async function inviteStaff(email, tenantId, name, role, hourlyRate, joinDate) {
  // Supabase Admin APIが使えないため、サインアップリンクを生成
  // 運用上は招待メール機能を使うか、管理者がパスワードを設定して渡す
  const { data, error } = await sb.auth.admin?.inviteUserByEmail?.(email) || { error: 'admin_required' };
  if (error) {
    // フォールバック：仮パスワードでユーザー作成（管理者が後でリセット）
    throw new Error('スタッフ招待にはSupabase管理者権限が必要です。READMEのサーバーレス関数を参照してください。');
  }
  return data;
}

// ── PDF出力 ──────────────────────────────────────────────
async function generateReport(projectId, projectName, projectLocation) {
  const photos = await DB.getPhotos(null, { projectId });
  // 署名付きURLを取得
  const photosWithUrls = await Promise.all(photos.map(async ph => {
    let url = null;
    if (ph.storage_path) url = await Storage.getSignedUrl(ph.storage_path);
    return { ...ph, url };
  }));

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>工事写真帳</title>
  <style>body{font-family:sans-serif;padding:32px}h1{border-bottom:3px solid #e05a1e;padding-bottom:8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}.card{border:1px solid #ddd;border-radius:6px;overflow:hidden}.thumb{width:100%;height:160px;object-fit:cover;background:#eee;display:flex;align-items:center;justify-content:center;font-size:36px}.info{padding:8px 10px;font-size:12px}.tags{color:#e05a1e}.ok{color:green}.check{color:orange}.ng{color:red}@media print{body{padding:16px}}</style>
  </head><body><h1>工事写真帳</h1>
  <p>工事名：${projectName}　場所：${projectLocation}　${photosWithUrls.length}枚　出力：${new Date().toLocaleDateString('ja-JP')}</p>
  <div class="grid">${photosWithUrls.map(ph => `
    <div class="card">
      ${ph.url ? `<img class="thumb" src="${ph.url}">` : `<div class="thumb">📷</div>`}
      <div class="info"><strong>${ph.filename}</strong><div class="tags">${(ph.ai_tags||[]).join(' / ')}</div><div class="${ph.status}">${ph.note||'—'}</div></div>
    </div>`).join('')}
  </div><script>window.onload=()=>window.print()<\/script></body></html>`);
  win.document.close();
}
