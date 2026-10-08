
const SUPABASE_URL='https://gptevruejeluzmnrfkks.supabase.co';
const SUPABASE_KEY='sb_publishable_msDkHKMUawuS-S6uqn5FbA_vsoaK3mJ';
const RESET_URL='https://cabanasomshanti.com/admin-reset.html';
const $=id=>document.getElementById(id);
const ARS=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Number(n||0));
const fmt=d=>new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'short',year:'numeric'}).format(new Date(d+'T12:00:00'));
const fmtDateTime24=d=>new Intl.DateTimeFormat('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(d))+' hs';
const fmtTime24=d=>new Intl.DateTimeFormat('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d)+' hs';
let token=null,user=null,bookings=[],blocks=[],history=[],rates=null,ratePeriods=[],calDate=new Date(),current=null;
let editingRatePeriodId=null;
let refreshTimer=null, refreshInProgress=false, lastRefreshAt=null;
let sessionExpiryHandled=false;

async function authLogin(email,password){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const j=await r.json(); if(!r.ok) throw new Error(j.error_description||j.msg||j.message||'No se pudo iniciar sesión');
  return j;
}
async function authUser(t){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${t}`}});
  const j=await r.json(); if(!r.ok) throw new Error(j.message||'No se pudo validar el usuario'); return j;
}
async function isCurrentAdmin(t){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_om_shanti_admin`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${t}`,'Content-Type':'application/json'},
    body:'{}'
  });
  const j=await r.json();
  if(!r.ok) throw new Error(j.message||'No se pudo validar el permiso de administrador');
  return j===true;
}
async function authRecover(email){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(RESET_URL)}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({email})
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.msg||j.message||'No se pudo enviar el correo de recuperación');
  return j;
}
function isExpiredAuthMessage(message=''){
  return /jwt expired|token.*expired|expired.*jwt/i.test(String(message||''));
}
function handleExpiredAdminSession(){
  if(sessionExpiryHandled) return;
  sessionExpiryHandled=true;
  stopAutoRefresh();
  clearSession();
  alert('Tu sesión venció. Volvé a iniciar sesión para continuar.');
  location.reload();
}
async function rest(path,opts={}){
  const headers={apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation',...(opts.headers||{})};
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...opts,headers});
  const text=await r.text();
  if(!r.ok){
    let m=text;
    try{const parsed=JSON.parse(text);m=parsed.message||parsed.msg||parsed.error_description||text}catch(e){}
    if(r.status===401 || isExpiredAuthMessage(m)){handleExpiredAdminSession();throw new Error('Tu sesión venció.');}
    throw new Error(m);
  }
  return text?JSON.parse(text):null;
}
function saveSession(data){localStorage.setItem('omAdminSession',JSON.stringify({access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now()+data.expires_in*1000}))}
function clearSession(){localStorage.removeItem('omAdminSession');token=null;user=null}
async function tryRestore(){
  const s=JSON.parse(localStorage.getItem('omAdminSession')||'null'); if(!s||!s.access_token)return false;if(s.expires_at<Date.now()){clearSession();return false;}
  token=s.access_token; try{user=await authUser(token); if(!(await isCurrentAdmin(token))) throw new Error('Usuario no autorizado'); return true}catch(e){clearSession();return false}
}
$('loginBtn').onclick=async()=>{$('loginMsg').innerHTML='';try{const data=await authLogin($('loginEmail').value.trim(),$('loginPassword').value);token=data.access_token;user=data.user;if(!(await isCurrentAdmin(token))){clearSession();throw new Error('Este usuario no tiene permisos de administrador.')}saveSession(data);showApp();await loadAll();startAutoRefresh();}catch(e){$('loginMsg').innerHTML=`<div class="notice error">${e.message}</div>`}};
$('forgotPasswordBtn').onclick=async()=>{
  const email=$('loginEmail').value.trim();
  $('loginMsg').innerHTML='';
  if(!email)return $('loginMsg').innerHTML='<div class="notice error">Escribí primero tu email de administrador.</div>';
  try{
    await authRecover(email);
    $('loginMsg').innerHTML='<div class="notice ok">Te enviamos un correo para crear una nueva contraseña. Revisá también Spam/Correo no deseado.</div>';
  }catch(e){
    $('loginMsg').innerHTML=`<div class="notice error">${e.message}</div>`;
  }
};

$('logoutBtn').onclick=()=>{stopAutoRefresh();clearSession();location.reload()};
async function showApp(){$('loginScreen').classList.add('hidden');$('app').classList.remove('hidden');$('adminEmail').textContent=user?.email||''}

async function getSignedProofUrl(path){
  if(!path) return null;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/booking-proofs/${path}`,{
    method:'POST',
    headers:{
      apikey:SUPABASE_KEY,
      Authorization:`Bearer ${token}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({expiresIn:300})
  });
  const j = await r.json();
  if(!r.ok){
    const msg=j.message||j.msg||'No se pudo abrir el comprobante';
    if(r.status===401 || isExpiredAuthMessage(msg)){handleExpiredAdminSession();throw new Error('Tu sesión venció.');}
    throw new Error(msg);
  }
  return `${SUPABASE_URL}/storage/v1${j.signedURL}`;
}

async function openProof(path){
  try{
    const url = await getSignedProofUrl(path);
    if(!url) return alert('Esta reserva todavía no tiene comprobante.');
    window.open(url,'_blank','noopener');
  }catch(e){
    alert(e.message);
  }
}
window.openProof = openProof;

function statusLabel(s){return ({pending:'Pendiente',confirmed:'Confirmada',rejected:'Rechazada',cancelled:'Cancelada',completed:'Finalizada'})[s]||s}
function pendingStage(b){if(b.status!=='pending')return null;if(b.proof_path)return 'Pago enviado';if(b.expires_at&&new Date(b.expires_at)<=new Date())return 'Vencida';return 'Esperando pago'}
function bookingLabel(b){return pendingStage(b)||statusLabel(b.status)}
function active(b){if(b.status==='confirmed')return true;if(b.status==='pending'&&b.proof_path)return true;if(b.status==='pending')return !b.expires_at||new Date(b.expires_at)>new Date();return false}
function isExpiredBooking(b){return b?.status==='pending'&&!b?.proof_path&&!!b?.expires_at&&new Date(b.expires_at)<=new Date()}
async function loadAll(options={}){
  if(!token || refreshInProgress) return;
  refreshInProgress=true;
  const currentId=current?.id||null;
  const modalWasOpen=$('bookingModal')?.classList.contains('open');
  try{
    [bookings,blocks,history,ratePeriods]=await Promise.all([
      rest('bookings?select=*&order=created_at.desc'),
      rest('blocks?select=*&order=created_at.desc'),
      rest('booking_history?select=*&order=created_at.desc'),
      rest('rate_periods?select=*&order=start_date.asc')
    ]);
    const rr=await rest('rates?select=*&id=eq.1');
    rates=rr[0]||null;
    renderAll();
    if(currentId){
      current=bookings.find(x=>x.id===currentId)||null;
      // En actualizaciones automáticas silenciosas no reconstruimos el modal abierto.
      // Así no se pierden textos que el administrador esté escribiendo (por ejemplo,
      // el motivo de rechazo) ni cambios aún no guardados en fechas/huéspedes/cabaña.
      if(modalWasOpen && current && !options.silent) renderModal();
      if(modalWasOpen && !current) $('bookingModal').classList.remove('open');
    }
    lastRefreshAt=new Date();
    updateRefreshStatus();
  }catch(e){
    console.error('Error al actualizar panel:',e);
    updateRefreshStatus(true);
    if(!options.silent) throw e;
  }finally{
    refreshInProgress=false;
  }
}
function updateRefreshStatus(hasError=false){
  const el=$('refreshStatus');
  if(!el)return;
  if(hasError){el.textContent='Actualización pendiente';return;}
  if(!lastRefreshAt){el.textContent='Actualización automática activa';return;}
  el.textContent=`Actualizado ${fmtTime24(lastRefreshAt)}`;
}
function startAutoRefresh(){
  if(refreshTimer) clearInterval(refreshTimer);
  refreshTimer=setInterval(()=>{
    if(document.visibilityState==='visible') loadAll({silent:true});
  },15000);
}
function stopAutoRefresh(){if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null;}}
function renderAll(){renderStats();renderRows();renderCalendar();renderBlocks();renderRates();renderSummary()}
function renderStats(){
  $('stPending').textContent=bookings.filter(x=>x.status==='pending'&&x.proof_path).length;
  $('stConfirmed').textContent=bookings.filter(x=>x.status==='confirmed').length;
  $('stFuture').textContent=bookings.filter(x=>active(x)&&new Date(x.checkout+'T12:00:00')>=new Date()).length;
  $('stRevenue').textContent=ARS(bookings.filter(x=>x.status==='confirmed').reduce((a,b)=>a+Number(b.total_amount||0),0));
}
function renderSummary(){
  const next=bookings.filter(x=>active(x)&&new Date(x.checkout+'T12:00:00')>=new Date()).sort((a,b)=>a.checkin.localeCompare(b.checkin)).slice(0,5);
  $('nextBookings').innerHTML=next.length?next.map(b=>`<div class="detail" style="margin-bottom:8px"><span>${bookingLabel(b)} · ${b.unit_id==='rustic'?'Rustic':'Zen'}</span><strong>${fmt(b.checkin)} → ${fmt(b.checkout)}</strong><div class="small">${b.guest_name} · ${ARS(b.total_amount)}</div></div>`).join(''):'<p class="muted">Sin próximas reservas.</p>';
  $('activity').innerHTML=history.length?history.slice(0,8).map(h=>`<div class="history-item"><strong>${h.event}</strong><span class="small">${fmtDateTime24(h.created_at)} · ${h.detail||''}${h.actor_email?` · Por ${h.actor_email}`:''}</span></div>`).join(''):'<p class="muted">Sin movimientos.</p>';
}
function renderRows(){
  const f=$('statusFilter').value||'all',arr=f==='all'?bookings:bookings.filter(x=>x.status===f);
  $('rows').innerHTML=arr.map(b=>`<tr><td><strong>${b.guest_name}</strong><br><span class="small">${b.guest_email}<br>${b.guest_phone}</span></td><td>${b.unit_id==='rustic'?'Rustic':'Zen'}</td><td>${fmt(b.checkin)}<br>${fmt(b.checkout)}</td><td>${ARS(b.total_amount)}</td><td>${ARS(b.deposit_amount)}</td><td><span class="badge ${b.status}">${bookingLabel(b)}</span></td><td><button class="btn secondary" onclick="openBooking('${b.id}')">Abrir</button></td></tr>`).join('');
}
$('statusFilter').onchange=renderRows;
window.openBooking=id=>{current=bookings.find(x=>x.id===id);renderModal();$('bookingModal').classList.add('open')};
function renderModal(){
 const b=current;if(!b)return;
 const expired=isExpiredBooking(b);
 const editable=!expired&&!['rejected','cancelled','completed'].includes(b.status);
 const hist=history.filter(h=>h.booking_id===b.id);
 $('mTitle').textContent=`${b.guest_name} · ${b.unit_id==='rustic'?'Rustic':'Zen'}`;
 $('mBody').innerHTML=`
 ${expired?'<div class="notice" style="margin-bottom:14px"><strong>Reserva vencida.</strong> Las fechas ya fueron liberadas y este registro queda solo para consulta.</div>':''}
 <div class="detail-grid"><div class="detail"><span>Estado</span><strong>${bookingLabel(b)}</strong></div><div class="detail"><span>Importes</span><strong>${ARS(b.total_amount)}</strong><div class="small">Seña ${ARS(b.deposit_amount)}</div></div><div class="detail"><span>Contacto</span><strong>${b.guest_email}</strong><div class="small">${b.guest_phone}</div></div><div class="detail"><span>Comprobante</span>${b.proof_path?`<strong>Archivo recibido ✓</strong><div style="margin-top:8px"><button class="btn secondary" onclick="openProof('${b.proof_path}')">Abrir comprobante</button></div>`:'<strong>Todavía no cargado</strong>'}</div></div>
 <h3>${expired?'Datos de la reserva':'Modificar reserva'}</h3><div class="detail-grid"><div class="field"><label>Ingreso</label><input id="eIn" type="date" value="${b.checkin}" ${editable?'':'disabled'}></div><div class="field"><label>Salida</label><input id="eOut" type="date" value="${b.checkout}" ${editable?'':'disabled'}></div><div class="field"><label>Huéspedes</label><select id="eGuests" ${editable?'':'disabled'}>${[1,2,3,4].map(n=>`<option ${n===b.guests?'selected':''}>${n}</option>`).join('')}</select></div><div class="field"><label>Cabaña</label><select id="eUnit" ${editable?'':'disabled'}><option value="rustic" ${b.unit_id==='rustic'?'selected':''}>Rustic</option><option value="zen" ${b.unit_id==='zen'?'selected':''}>Zen</option></select></div></div>
 ${editable?'<button class="btn secondary" id="saveEdit" style="margin-top:12px">Guardar cambios</button>':''}
 <h3>Acciones</h3><div class="actions">${b.status==='pending'&&b.proof_path?'<button class="btn primary" id="confirmBtn">Confirmar</button><button class="btn danger" id="rejectBtn">Rechazar</button>':''}${b.status==='confirmed'?'<button class="btn warning" id="cancelBtn">Cancelar reserva</button><button class="btn secondary" id="completeBtn">Finalizar</button>':''}</div>
 <div id="rejectBox" class="hidden"><div class="field" style="margin-top:12px"><label>Motivo del rechazo</label><textarea id="rejectReason"></textarea></div><button class="btn danger" id="doReject" style="margin-top:10px">Rechazar reserva</button></div>
 <h3>Historial</h3><div class="history">${hist.length?hist.map(h=>`<div class="history-item"><strong>${h.event}</strong><span class="small">${fmtDateTime24(h.created_at)} · ${h.detail||''}${h.actor_email?` · Por ${h.actor_email}`:''}</span></div>`).join(''):'<p class="muted">Sin historial.</p>'}</div>`;
 if($('confirmBtn'))$('confirmBtn').onclick=()=>changeStatus('confirmed','Reserva confirmada','Comprobante validado por administrador.');
 if($('rejectBtn'))$('rejectBtn').onclick=()=>$('rejectBox').classList.remove('hidden');
 if($('doReject'))$('doReject').onclick=async()=>{const r=$('rejectReason').value.trim();if(!r)return alert('Escribí un motivo.');await patchBooking({status:'rejected',cancellation_reason:r},'Reserva rechazada',r)};
 if($('cancelBtn'))$('cancelBtn').onclick=async()=>{const r=prompt('Motivo de cancelación (opcional)')||'';await patchBooking({status:'cancelled',cancellation_reason:r},'Reserva cancelada',r)};
 if($('completeBtn'))$('completeBtn').onclick=()=>changeStatus('completed','Estadía finalizada','');
 if($('saveEdit'))$('saveEdit').onclick=saveEdit;
 if($('eIn')&&$('eOut')&&editable){
   const syncEditCheckout=()=>{
     const a=$('eIn').value;if(!a)return;
     const minOut=isoAddDays(a,1);
     $('eOut').min=minOut;
     if(!$('eOut').value||$('eOut').value<minOut)$('eOut').value=minOut;
   };
   $('eOut').min=isoAddDays($('eIn').value,1);
   $('eIn').addEventListener('change',()=>{
     const a=$('eIn').value;if(!a)return;
     const next=isoAddDays(a,1);
     $('eOut').min=next;
     $('eOut').value=next;
   });
   $('eOut').addEventListener('change',syncEditCheckout);
 }
}

async function triggerBookingEmail(bookingId, event){
  const r=await fetch(`${SUPABASE_URL}/functions/v1/send-booking-email`,{
    method:'POST',
    headers:{
      apikey:SUPABASE_KEY,
      Authorization:`Bearer ${token}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({booking_id:bookingId,event})
  });
  const text=await r.text();
  let data=null;try{data=text?JSON.parse(text):null}catch(e){}
  if(!r.ok){
    const msg=data?.error||data?.message||text||'No se pudo enviar el email automático.';
    if(r.status===401 || isExpiredAuthMessage(msg)){handleExpiredAdminSession();throw new Error('Tu sesión venció.');}
    throw new Error(msg);
  }
  return data;
}

function emailEventForStatus(status){
  return ({
    confirmed:'booking_confirmed',
    rejected:'booking_rejected',
    cancelled:'booking_cancelled'
  })[status]||null;
}

async function insertHistory(booking_id,event,detail=''){await rest('rpc/add_admin_booking_history',{method:'POST',body:JSON.stringify({p_booking_id:booking_id,p_event:event,p_detail:detail})})}
async function patchBooking(fields,event,detail=''){
  try{
    const bookingId=current.id;
    await rest(`bookings?id=eq.${bookingId}`,{method:'PATCH',body:JSON.stringify(fields)});
    await insertHistory(bookingId,event,detail);

    // V5.4: si cambió a un estado que tiene correo asociado,
    // lo dispara automáticamente después de guardar el estado.
    const mailEvent = fields.status
      ? emailEventForStatus(fields.status)
      : (event==='Reserva modificada' && current?.status==='confirmed' ? 'booking_updated' : null);
    let emailWarning='';
    if(mailEvent){
      try{
        await triggerBookingEmail(bookingId,mailEvent);
      }catch(emailError){
        console.error('Reserva actualizada, pero falló el email automático:',emailError);
        emailWarning='La reserva se actualizó, pero no se pudo enviar el email automático. Revisá Resend/Supabase.';
      }
    }

    await loadAll();
    current=bookings.find(x=>x.id===bookingId);
    renderModal();
    if(emailWarning) alert(emailWarning);
  }catch(e){
    console.error('Error al actualizar reserva:',e);
    if(sessionExpiryHandled || isExpiredAuthMessage(e.message)) return;
    alert('No se pudo actualizar la reserva: '+e.message);
  }
}
async function changeStatus(status,event,detail){await patchBooking({status},event,detail)}
function nightsBetween(a,b){return Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000)}
function isoAddDays(iso,days){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)}
function isWeekendOneNight(a,b){return nightsBetween(a,b)===1&&[0,5,6].includes(new Date(a+'T12:00:00').getDay())}
function rateForDate(iso){
  const matches=(ratePeriods||[]).filter(p=>p.active!==false&&p.start_date<=iso&&iso<=p.end_date).sort((a,b)=>{
    const byStart=String(b.start_date).localeCompare(String(a.start_date));
    return byStart!==0?byStart:Number(b.id||0)-Number(a.id||0);
  });
  return matches[0]||rates;
}
function calc(a,b,g){
  const n=nightsBetween(a,b);
  let d=new Date(a+'T12:00:00'),base=0,extra=0;
  for(let i=0;i<n;i++){
    const iso=d.toISOString().slice(0,10),r=rateForDate(iso);
    base += [0,5,6].includes(d.getDay())?Number(r.weekend_package)/2:Number(r.weekday_rate);
    extra += Math.max(0,g-2)*Number(r.extra_guest_rate);
    d.setDate(d.getDate()+1);
  }
  const arrivalRate=rateForDate(a);
  const lateCheckout=isWeekendOneNight(a,b);
  const lateAmount=lateCheckout?Number(arrivalRate.late_checkout_weekend||0):0;
  const total=base+extra+lateAmount;
  const depositPercent=Number(arrivalRate.deposit_percent??rates.deposit_percent);
  return{
    total,
    deposit:Math.round(total*depositPercent/100),
    lateCheckout,
    lateAmount,
    blockedUntil:lateCheckout?isoAddDays(b,1):null
  };
}
function conflicts(unit,a,b,id){
  const requestedEnd=isWeekendOneNight(a,b)?isoAddDays(b,1):b;
  return bookings.some(x=>{
    if(x.id===id||x.unit_id!==unit||!active(x))return false;
    const occupiedUntil=x.blocked_until||x.checkout;
    return a<occupiedUntil&&requestedEnd>x.checkin;
  })||blocks.some(x=>x.unit_id===unit&&a<x.checkout&&requestedEnd>x.checkin);
}
async function saveEdit(){
  if(isExpiredBooking(current))return alert('Esta reserva está vencida y es solo de consulta.');
  const a=$('eIn').value,b=$('eOut').value,g=+$('eGuests').value,u=$('eUnit').value;
  if(!a||!b||b<=a)return alert('Revisá las fechas.');
  if(conflicts(u,a,b,current.id))return alert('Hay una superposición con otra reserva o bloqueo.');
  const q=calc(a,b,g);
  const detail=`${current.checkin}→${current.checkout} / ${current.unit_id} → ${a}→${b} / ${u}`;
  await patchBooking({
    checkin:a,
    checkout:b,
    guests:g,
    unit_id:u,
    total_amount:q.total,
    deposit_amount:q.deposit,
    late_checkout:q.lateCheckout,
    blocked_until:q.blockedUntil
  },'Reserva modificada',detail)
}
$('closeModal').onclick=()=>$('bookingModal').classList.remove('open');
$('bookingModal').onclick=e=>{if(e.target===$('bookingModal'))$('bookingModal').classList.remove('open')};

function calendarStateFor(unit,iso){
  const b=bookings.find(x=>x.unit_id===unit&&active(x)&&iso>=x.checkin&&iso<x.checkout);
  const late=bookings.find(x=>x.unit_id===unit&&active(x)&&x.late_checkout===true&&iso===x.checkout);
  const bl=blocks.find(x=>x.unit_id===unit&&iso>=x.checkin&&iso<x.checkout);

  if(bl){
    return{
      cls:'blocked',
      note:bl.source==='airbnb'?'Airbnb':(bl.reason||'Bloqueado')
    };
  }
  if(b){
    return{
      cls:b.status==='confirmed'?'confirmed':'pending',
      note:b.guest_name
    };
  }
  if(late){
    return{
      cls:late.status==='confirmed'?'confirmed':'pending',
      note:'Late checkout'
    };
  }
  return{cls:'free',note:'Libre'};
}

function dualCalendarSlot(unit,iso){
  const s=calendarStateFor(unit,iso);
  const code=unit==='rustic'?'R':'Z';
  const name=unit==='rustic'?'Rustic':'Zen';
  const compact=s.note==='Late checkout'?'Late':s.note;
  return `<div class="dual-slot ${unit} ${s.cls}" title="${name}: ${s.note}">
    <span class="dual-code">${code}</span>
    <span class="dual-text">${compact}</span>
  </div>`;
}

function renderCalendar(){
  const unit=$('calUnit').value,
        y=calDate.getFullYear(),
        m=calDate.getMonth(),
        first=new Date(y,m,1),
        last=new Date(y,m+1,0);

  $('calTitle').textContent=new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(first);

  const calendar=$('calendar');
  calendar.classList.toggle('calendar-both',unit==='both');

  let html=['Lu','Ma','Mi','Ju','Vi','Sá','Do']
    .map(x=>`<div class="day head">${x}</div>`)
    .join('');

  for(let i=0;i<(first.getDay()+6)%7;i++)html+='<div></div>';

  for(let d=1;d<=last.getDate();d++){
    const dt=new Date(y,m,d,12),
          iso=dt.toISOString().slice(0,10);

    if(unit==='both'){
      html+=`<div class="day day-both">
        <strong>${d}</strong>
        <div class="dual-slots">
          ${dualCalendarSlot('rustic',iso)}
          ${dualCalendarSlot('zen',iso)}
        </div>
      </div>`;
      continue;
    }

    const s=calendarStateFor(unit,iso);
    const cls=s.cls==='free'?'':s.cls;
    const note=s.cls==='free'?'':s.note;

    html+=`<div class="day ${cls}" title="${note}">
      <strong>${d}</strong>
      <div class="day-note small">${note}</div>
    </div>`;
  }

  calendar.innerHTML=html;
}
$('calUnit').onchange=renderCalendar;$('prevMonth').onclick=()=>{calDate=new Date(calDate.getFullYear(),calDate.getMonth()-1,1);renderCalendar()};$('nextMonth').onclick=()=>{calDate=new Date(calDate.getFullYear(),calDate.getMonth()+1,1);renderCalendar()};$('todayBtn').onclick=()=>{calDate=new Date();renderCalendar()};

function renderBlocks(){
  $('blockList').innerHTML=blocks.length?blocks.map(b=>{
    const imported=b.source==='airbnb';
    const sourceLabel=imported?'Airbnb':'Manual';
    return `<div class="detail" style="margin-bottom:8px"><span>${sourceLabel} · ${b.unit_id==='rustic'?'Rustic':'Zen'}</span><strong>${fmt(b.checkin)} → ${fmt(b.checkout)}</strong><div class="small">${b.reason||''}</div>${imported?'':'<button class="btn danger" onclick="deleteBlock(\''+b.id+'\')" style="margin-top:8px">Liberar</button>'}</div>`;
  }).join(''):'<p class="muted">Sin bloqueos activos.</p>'
}
window.deleteBlock=async id=>{await rest(`blocks?id=eq.${id}`,{method:'DELETE'});await loadAll()};
$('addBlock').onclick=async()=>{const u=$('blockUnit').value,a=$('blockIn').value,b=$('blockOut').value,r=$('blockReason').value.trim();$('blockMsg').innerHTML='';if(!a||!b||b<=a)return $('blockMsg').innerHTML='<div class="notice error">Revisá las fechas.</div>';if(conflicts(u,a,b,null))return $('blockMsg').innerHTML='<div class="notice error">Ese período ya está ocupado o bloqueado.</div>';await rest('blocks',{method:'POST',body:JSON.stringify({unit_id:u,checkin:a,checkout:b,reason:r||null})});$('blockMsg').innerHTML='<div class="notice ok">Bloqueo creado.</div>';await loadAll()};

async function syncAirbnb(unitId){
  const label=unitId==='rustic'?'Rustic':'Zen';
  const btn=$(unitId==='rustic'?'syncAirbnbRustic':'syncAirbnbZen'), msg=$('airbnbSyncMsg');
  if(!btn||!msg) return;
  btn.disabled=true; const original=btn.textContent; btn.textContent='Sincronizando…'; msg.textContent=`Consultando Airbnb · ${label}…`;
  try{
    if(!token) throw new Error('Tu sesión venció. Volvé a iniciar sesión.');
    const r=await fetch(`${SUPABASE_URL}/functions/v1/sync-airbnb-calendar`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,'apikey':SUPABASE_KEY},
      body:JSON.stringify({unit_id:unitId})
    });
    const text=await r.text(); let data={}; try{data=JSON.parse(text)}catch{}
    if(!r.ok) throw new Error(data?.error||text||'No se pudo sincronizar Airbnb');
    msg.textContent=`Airbnb sincronizado: ${data.imported} bloqueo${data.imported===1?'':'s'} importado${data.imported===1?'':'s'} para ${label}.`;
    msg.style.color='#50623d';
    await loadAll(); renderCalendar(); renderBlocks();
  }catch(e){
    msg.textContent=e?.message||String(e);
    msg.style.color='#a33';
  }finally{btn.disabled=false;btn.textContent=original}
}
async function syncAirbnbRustic(){return syncAirbnb('rustic')}
async function syncAirbnbZen(){return syncAirbnb('zen')}
if($('syncAirbnbRustic')) $('syncAirbnbRustic').onclick=syncAirbnbRustic;
if($('syncAirbnbZen')) $('syncAirbnbZen').onclick=syncAirbnbZen;


function renderRates(){
  if(!rates)return;
  $('rWeek').value=rates.weekday_rate;
  $('rWeekend').value=rates.weekend_package;
  $('rExtra').value=rates.extra_guest_rate;
  $('rLateWeek').value=rates.late_checkout_weekday;
  $('rLateWeekend').value=rates.late_checkout_weekend;
  if($('rDeposit'))$('rDeposit').value=rates.deposit_percent;
  renderRatePeriods();
}

function renderRatePeriods(){
  const list=$('ratePeriodList');
  if(!list)return;
  const rows=(ratePeriods||[]).filter(p=>p.active!==false).sort((a,b)=>a.start_date.localeCompare(b.start_date));
  if(!rows.length){
    list.innerHTML='<div class="rate-period-empty">Todavía no hay tarifas temporales creadas.</div>';
    return;
  }
  list.innerHTML=rows.map(p=>`
    <div class="rate-period-item">
      <div><span class="small">Período</span><strong>${p.label||'Sin nombre'}</strong></div>
      <div class="rate-period-dates">${fmt(p.start_date)} → ${fmt(p.end_date)}</div>
      <div class="rate-period-values">
        Lun-Jue ${ARS(p.weekday_rate)} · Finde ${ARS(p.weekend_package)}<br>
        Adicional ${ARS(p.extra_guest_rate)} · Late finde ${ARS(p.late_checkout_weekend)} · Seña ${p.deposit_percent}% · Mín. ${Number(p.minimum_nights||1)} noche${Number(p.minimum_nights||1)!==1?'s':''}
      </div>
      <div class="rate-period-actions">
        <button class="btn secondary" type="button" onclick="editRatePeriod(${Number(p.id)})">Editar</button>
        <button class="btn danger" type="button" onclick="deleteRatePeriod(${Number(p.id)})">Eliminar</button>
      </div>
    </div>`).join('');
}

function resetRatePeriodForm(){
  editingRatePeriodId=null;
  ['rpLabel','rpStart','rpEnd','rpWeek','rpWeekend','rpExtra','rpLateWeek','rpLateWeekend'].forEach(id=>{if($(id))$(id).value=''});
  if($('rpDeposit'))$('rpDeposit').value=rates?.deposit_percent??50;
  if($('rpMinNights'))$('rpMinNights').value=1;
  if($('saveRatePeriod'))$('saveRatePeriod').textContent='Guardar período';
  if($('ratePeriodMsg'))$('ratePeriodMsg').textContent='';
}

function showRatePeriodForm(){
  resetRatePeriodForm();
  const r=rates||{};
  $('rpWeek').value=r.weekday_rate??'';
  $('rpWeekend').value=r.weekend_package??'';
  $('rpExtra').value=r.extra_guest_rate??'';
  $('rpLateWeek').value=r.late_checkout_weekday??'';
  $('rpLateWeekend').value=r.late_checkout_weekend??'';
  $('rpDeposit').value=r.deposit_percent??50;
  $('rpMinNights').value=1;
  $('ratePeriodForm').classList.remove('hidden');
}

function periodValuesFromForm(){
  return{
    label:$('rpLabel').value.trim()||null,
    start_date:$('rpStart').value,
    end_date:$('rpEnd').value,
    weekday_rate:+$('rpWeek').value,
    weekend_package:+$('rpWeekend').value,
    extra_guest_rate:+$('rpExtra').value,
    late_checkout_weekday:+$('rpLateWeek').value,
    late_checkout_weekend:+$('rpLateWeekend').value,
    deposit_percent:+$('rpDeposit').value,
    minimum_nights:+$('rpMinNights').value,
    active:true
  };
}

function validatePeriodValues(v){
  if(!v.start_date||!v.end_date||v.end_date<v.start_date)return 'Revisá las fechas del período.';
  const nums=[v.weekday_rate,v.weekend_package,v.extra_guest_rate,v.late_checkout_weekday,v.late_checkout_weekend];
  if(nums.some(n=>!Number.isFinite(n)||n<0))return 'Revisá los importes: deben ser números iguales o mayores a 0.';
  if(!Number.isFinite(v.deposit_percent)||v.deposit_percent<0||v.deposit_percent>100)return 'La seña debe ser un porcentaje entre 0 y 100.';
  if(!Number.isInteger(v.minimum_nights)||v.minimum_nights<1||v.minimum_nights>30)return 'La estadía mínima debe ser un número entre 1 y 30 noches.';
  const overlap=(ratePeriods||[]).find(p=>p.active!==false&&Number(p.id)!==Number(editingRatePeriodId)&&v.start_date<=p.end_date&&v.end_date>=p.start_date);
  if(overlap)return `Ese período se superpone con "${overlap.label||'otro período'}" (${fmt(overlap.start_date)} → ${fmt(overlap.end_date)}).`;
  return null;
}

$('saveRates').onclick=async()=>{
  const values={
    weekday_rate:+$('rWeek').value,
    weekend_package:+$('rWeekend').value,
    extra_guest_rate:+$('rExtra').value,
    late_checkout_weekday:+$('rLateWeek').value,
    late_checkout_weekend:+$('rLateWeekend').value,
    deposit_percent:+$('rDeposit').value
  };
  const amounts=[values.weekday_rate,values.weekend_package,values.extra_guest_rate,values.late_checkout_weekday,values.late_checkout_weekend];
  if(amounts.some(v=>!Number.isFinite(v)||v<0)||!Number.isFinite(values.deposit_percent)||values.deposit_percent<0||values.deposit_percent>100){
    alert('Revisá las tarifas y el porcentaje de seña.');
    return;
  }
  $('saveRates').disabled=true;
  $('rateMsg').textContent=' Guardando…';
  try{
    await rest('rates?id=eq.1',{method:'PATCH',body:JSON.stringify(values)});
    await loadAll();
    $('rateMsg').textContent=' Guardado ✓';
    setTimeout(()=>$('rateMsg').textContent='',1800);
  }catch(e){
    $('rateMsg').textContent=' Error al guardar';
    alert('No pudimos guardar la tarifa general: '+e.message);
  }finally{
    $('saveRates').disabled=false;
  }
};

if($('newRatePeriod'))$('newRatePeriod').onclick=showRatePeriodForm;
if($('cancelRatePeriod'))$('cancelRatePeriod').onclick=()=>{$('ratePeriodForm').classList.add('hidden');resetRatePeriodForm()};

window.editRatePeriod=id=>{
  const p=(ratePeriods||[]).find(x=>Number(x.id)===Number(id));
  if(!p)return;
  editingRatePeriodId=Number(id);
  $('rpLabel').value=p.label||'';
  $('rpStart').value=p.start_date;
  $('rpEnd').value=p.end_date;
  $('rpWeek').value=p.weekday_rate;
  $('rpWeekend').value=p.weekend_package;
  $('rpExtra').value=p.extra_guest_rate;
  $('rpLateWeek').value=p.late_checkout_weekday;
  $('rpLateWeekend').value=p.late_checkout_weekend;
  $('rpDeposit').value=p.deposit_percent;
  $('rpMinNights').value=Number(p.minimum_nights||1);
  $('saveRatePeriod').textContent='Guardar cambios';
  $('ratePeriodMsg').textContent='';
  $('ratePeriodForm').classList.remove('hidden');
  $('ratePeriodForm').scrollIntoView({behavior:'smooth',block:'nearest'});
};

window.deleteRatePeriod=async id=>{
  const p=(ratePeriods||[]).find(x=>Number(x.id)===Number(id));
  if(!p)return;
  if(!confirm(`¿Eliminar la tarifa temporal "${p.label||'Sin nombre'}"?`))return;
  try{
    await rest(`rate_periods?id=eq.${Number(id)}`,{method:'DELETE'});
    await loadAll();
  }catch(e){
    alert('No pudimos eliminar el período: '+e.message);
  }
};

if($('saveRatePeriod'))$('saveRatePeriod').onclick=async()=>{
  const values=periodValuesFromForm();
  const error=validatePeriodValues(values);
  if(error){$('ratePeriodMsg').textContent=error;return;}
  $('saveRatePeriod').disabled=true;
  $('ratePeriodMsg').textContent=editingRatePeriodId?' Guardando cambios…':' Creando período…';
  try{
    if(editingRatePeriodId){
      await rest(`rate_periods?id=eq.${editingRatePeriodId}`,{method:'PATCH',body:JSON.stringify({...values,updated_at:new Date().toISOString()})});
    }else{
      await rest('rate_periods',{method:'POST',body:JSON.stringify(values)});
    }
    await loadAll();
    $('ratePeriodForm').classList.add('hidden');
    resetRatePeriodForm();
  }catch(e){
    $('ratePeriodMsg').textContent=' Error';
    alert('No pudimos guardar el período: '+e.message);
  }finally{
    $('saveRatePeriod').disabled=false;
  }
};

document.querySelectorAll('.sidebtn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.sidebtn').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));$(b.dataset.section).classList.add('active')});

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&token)loadAll({silent:true});});
window.addEventListener('focus',()=>{if(token)loadAll({silent:true});});
window.addEventListener('beforeunload',stopAutoRefresh);

(async()=>{if(await tryRestore()){await showApp();await loadAll();startAutoRefresh();}})();
