
const SUPABASE_URL = 'https://gptevruejeluzmnrfkks.supabase.co';
const SUPABASE_KEY = 'sb_publishable_msDkHKMUawuS-S6uqn5FbA_vsoaK3mJ';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const ARS = n => new Intl.NumberFormat('es-AR', {style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n);
const fmt = d => new Intl.DateTimeFormat('es-AR', {day:'numeric',month:'long',year:'numeric'}).format(new Date(d+'T12:00:00'));

let config = null;
let selectedUnit = null;
let selectedQuote = null;
let currentPreBooking = null;
const imageMap = {rustic:'assets/rustic.jpg', zen:'assets/zen.jpg'};
const galleryLabels = {deck:'Deck',living:'Living',cocina:'Cocina',dormitorio:'Dormitorio',bano:'Baño'};
const galleryDescriptions = {
  zen:'Conocé los espacios de la cabaña Zen: deck, ambiente interior, cocina, sector de descanso y baño. Un lugar para disfrutar Tigre a tu ritmo.',
  rustic:'Conocé los espacios de la cabaña Rustic: deck, ambiente interior, cocina, sector de descanso y baño. Comodidad y tranquilidad cerca de todo.'
};
const galleryKeys = ['deck','living','cocina','dormitorio','bano'];
let galleryUnitId = null;
let galleryIndex = 0;
let galleryReturnFocus = null;
let availableGalleryUnits = new Set();
function galleryRender() {
  const key=galleryKeys[galleryIndex];
  $('galleryPhoto').src=`assets/galeria/${galleryUnitId}/${key}.webp`;
  $('galleryPhoto').alt=`${galleryLabels[key]} de la cabaña ${galleryUnitId==='zen'?'Zen':'Rustic'}`;
  $('galleryCaption').textContent=`${galleryLabels[key]} · ${galleryIndex+1} de ${galleryKeys.length}`;
  $('galleryDescription').textContent=galleryDescriptions[galleryUnitId];
  $('galleryTitle').textContent=`Cabaña ${galleryUnitId==='zen'?'Zen':'Rustic'}`;
}
function openGallery(id, trigger) {
  if(!['zen','rustic'].includes(id))return;
  galleryUnitId=id;galleryIndex=0;galleryReturnFocus=trigger;
  galleryRender();
  const canChoose = availableGalleryUnits.has(id);
  $('galleryChoose').disabled = !canChoose;
  $('galleryChoose').textContent = canChoose ? 'Elegir esta cabaña' : 'No disponible para estas fechas';
  $('galleryModal').classList.add('open');
  $('galleryModal').setAttribute('aria-hidden','false');
  document.body.classList.add('gallery-open');
  $('galleryClose').focus();
}
function closeGallery(){
  $('galleryModal').classList.remove('open');
  $('galleryModal').setAttribute('aria-hidden','true');
  document.body.classList.remove('gallery-open');
  if(galleryReturnFocus?.isConnected)galleryReturnFocus.focus();
}
$('galleryClose').onclick=closeGallery;
$('galleryDismiss').onclick=closeGallery;
$('galleryPrev').onclick=()=>{galleryIndex=(galleryIndex+galleryKeys.length-1)%galleryKeys.length;galleryRender()};
$('galleryNext').onclick=()=>{galleryIndex=(galleryIndex+1)%galleryKeys.length;galleryRender()};
$('galleryModal').addEventListener('click',e=>{if(e.target===$('galleryModal'))closeGallery()});
document.addEventListener('keydown',e=>{
  if(!$('galleryModal').classList.contains('open'))return;
  if(e.key==='Escape')closeGallery();
  if(e.key==='ArrowLeft')$('galleryPrev').click();
  if(e.key==='ArrowRight')$('galleryNext').click();
});
$('galleryChoose').onclick=()=>{
  const id=galleryUnitId;
  if(!selectedQuote || !availableGalleryUnits.has(id)) return;
  closeGallery();
  selectUnit(id);
};


async function refreshConfig() {
  const {data,error} = await db.rpc('get_booking_config');
  if(error) throw error;
  config = data;
  return config;
}

function nightsBetween(a,b) {
  return Math.round((new Date(b+'T12:00:00') - new Date(a+'T12:00:00')) / 86400000);
}

function periodForDate(iso) {
  const periods = Array.isArray(config?.rate_periods) ? config.rate_periods : [];

  const matches = periods
    .filter(p => p.start_date <= iso && iso <= p.end_date)
    .sort((a,b) => {
      const byStart = String(b.start_date).localeCompare(String(a.start_date));
      if(byStart !== 0) return byStart;
      return Number(b.id || 0) - Number(a.id || 0);
    });

  return matches[0] || null;
}

function rateForDate(iso) {
  return periodForDate(iso) || config.rates;
}

function minimumNightsForCheckin(iso) {
  const period = periodForDate(iso);
  return Math.max(1, Number(period?.minimum_nights || 1));
}

function isWeekendOneNight(a,b) {
  const nights = nightsBetween(a,b);
  const dow = new Date(a+'T12:00:00').getDay();
  const minimumNights = minimumNightsForCheckin(a);
  return minimumNights === 1 && nights === 1 && [0,5,6].includes(dow);
}


function bestStayDiscount(a,b,nights) {
  const discounts=Array.isArray(config?.stay_discounts)?config.stay_discounts:[];
  const lastNight=new Date(b+'T12:00:00');lastNight.setDate(lastNight.getDate()-1);
  const lastIso=lastNight.getFullYear()+'-'+String(lastNight.getMonth()+1).padStart(2,'0')+'-'+String(lastNight.getDate()).padStart(2,'0');
  return discounts.filter(d=>d.active!==false&&nights>=Number(d.minimum_nights)&&a>=d.start_date&&lastIso<=d.end_date)
    .sort((x,y)=>Number(y.discount_percent)-Number(x.discount_percent)||Number(y.minimum_nights)-Number(x.minimum_nights)||Number(y.id)-Number(x.id))[0]||null;
}

function localEstimate(a,b,g) {
  const nights = nightsBetween(a,b);
  let d = new Date(a+'T12:00:00');
  let base = 0;
  let extra = 0;

  for(let i=0;i<nights;i++) {
    const iso = d.toISOString().slice(0,10);
    const r = rateForDate(iso);

    base += [0,5,6].includes(d.getDay())
      ? r.weekend_package/2
      : r.weekday_rate;

    extra += Math.max(0,g-2) * r.extra_guest_rate;
    d.setDate(d.getDate()+1);
  }

  const arrivalRate = rateForDate(a);
  const lateCheckout = isWeekendOneNight(a,b);
  const lateCheckoutAmount = lateCheckout
    ? Number(arrivalRate.late_checkout_weekend || 0)
    : 0;

  const originalAmount=base+extra+lateCheckoutAmount;
  const discount=bestStayDiscount(a,b,nights);
  const discountPercent=Number(discount?.discount_percent||0);
  const discountAmount=Math.round(originalAmount*discountPercent/100);
  const total=originalAmount-discountAmount;
  const depositPercent = Number(arrivalRate.deposit_percent ?? config.rates.deposit_percent);

  return {
    nights,
    base,
    extra,
    lateCheckout,
    lateCheckoutAmount,
    originalAmount,discountPercent,discountAmount,stayDiscountId:discount?.id||null,
    total,
    depositPercent,
    deposit: Math.round(total * depositPercent / 100)
  };
}

function renderSummary() {
  if(!selectedQuote) return;
  const depositPercent = Number(selectedQuote.depositPercent ?? config.rates.deposit_percent);

  $('summary').innerHTML = `
    <div class="summary-row"><span>Ingreso</span><strong>${fmt(selectedQuote.checkin)}</strong></div>
    <div class="summary-row"><span>Salida</span><strong>${fmt(selectedQuote.checkout)}</strong></div>
    <div class="summary-row"><span>Noches</span><strong>${selectedQuote.nights}</strong></div>
    ${selectedQuote.lateCheckout ? `<div class="summary-row"><span>Modalidad</span><strong>1 noche + late checkout</strong></div>` : ''}
    <div class="summary-row"><span>Huéspedes</span><strong>${selectedQuote.guests}</strong></div>
    <div class="summary-row"><span>Tarifa base</span><strong>${ARS(selectedQuote.base)}</strong></div>
    ${selectedQuote.extra ? `<div class="summary-row"><span>Huéspedes adicionales</span><strong>${ARS(selectedQuote.extra)}</strong></div>` : ''}
    ${selectedQuote.lateCheckout ? `<div class="summary-row"><span>Late checkout</span><strong>${ARS(selectedQuote.lateCheckoutAmount)}</strong></div>` : ''}
    ${selectedQuote.discountAmount>0 ? `<div class="summary-row"><span>Subtotal</span><strong>${ARS(selectedQuote.originalAmount)}</strong></div><div class="summary-row"><span>Descuento por estadía (${selectedQuote.discountPercent}%)</span><strong>−${ARS(selectedQuote.discountAmount)}</strong></div>` : ''}
    <div class="summary-row total"><span>Total estimado</span><span>${ARS(selectedQuote.total)}</span></div>
    <div class="deposit">Seña estimada (${depositPercent}%)<strong>${ARS(selectedQuote.deposit)}</strong></div>
    <p class="small">El importe final de la seña se confirma al continuar con la reserva.</p>`;
}


async function uploadProof(bookingId, file, emailToken) {
  if(!file) throw new Error('Seleccioná un comprobante.');
  if(file.size > 5 * 1024 * 1024) throw new Error('El comprobante supera los 5 MB.');
  const allowed = ['image/jpeg','image/png','application/pdf'];
  if(!allowed.includes(file.type)) throw new Error('Formato no permitido. Usá JPG, PNG o PDF.');

  const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'bin';
  const safeName = `${bookingId}/${crypto.randomUUID()}.${ext}`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/booking-proofs/${safeName}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': file.type,
      'x-upsert': 'false'
    },
    body: file
  });

  const text = await res.text();
  if(!res.ok) {
    let message = text;
    try { message = JSON.parse(text).message || text; } catch(e) {}
    throw new Error('No pudimos subir el comprobante: ' + message);
  }

  const { error: attachError } = await db.rpc('attach_booking_proof_secure', {
    p_booking_id: bookingId,
    p_proof_path: safeName,
    p_email_token: emailToken
  });

  if(attachError) {
    throw new Error('El comprobante se subió, pero no se pudo vincular a la reserva: ' + attachError.message);
  }

  return safeName;
}


async function triggerBookingEmail(bookingId, event, emailToken = null, recoveryToken = null) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-booking-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY
    },
    body: JSON.stringify({
      booking_id: bookingId,
      event,
      ...(emailToken ? { email_token: emailToken } : {}),
      ...(recoveryToken ? { recovery_token: recoveryToken } : {})
    })
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(e) {}

  if(!response.ok) {
    throw new Error(data?.error || text || 'No se pudo enviar el email automático.');
  }
  return data;
}

async function restorePendingBookingFromUrl() {
  const token = new URLSearchParams(window.location.search).get('token');
  if(!token) return false;

  $('searchMessage').innerHTML = '<div class="notice">Recuperando tu reserva pendiente…</div>';

  const { data: recovered, error } = await db.rpc('get_pending_booking_by_token', {
    p_token: token
  });
  if(error) throw error;

  if(!recovered?.ok) {
    const message = recovered?.status === 'expired'
      ? 'El plazo de 2 horas de esta reserva ya venció. Podés consultar nuevamente la disponibilidad.'
      : recovered?.status === 'pending'
        ? 'No pudimos recuperar esta reserva pendiente.'
        : recovered?.status && recovered.status !== 'not_found'
          ? 'Esta reserva ya no está pendiente de pago.'
          : 'El enlace de recuperación no es válido o ya no está disponible.';

    $('searchMessage').innerHTML = `<div class="notice error"><strong>No pudimos retomar la reserva.</strong><br>${message}</div>`;
    return true;
  }

  currentPreBooking = {
    ...recovered,
    payment_recovery_token: token
  };

  selectedUnit = (config.units || []).find(u => u.id === recovered.unit_id) || {
    id: recovered.unit_id,
    name: recovered.unit || 'Cabaña'
  };

  const est = localEstimate(recovered.checkin, recovered.checkout, Number(recovered.guests));
  selectedQuote = {
    checkin: recovered.checkin,
    checkout: recovered.checkout,
    guests: Number(recovered.guests),
    ...est,
    originalAmount: Number(recovered.original_amount??recovered.total_amount),
    discountPercent:Number(recovered.discount_percent||0),
    discountAmount:Number(recovered.discount_amount||0),
    total: Number(recovered.total_amount),
    deposit: Number(recovered.deposit_amount)
  };

  $('summaryUnit').textContent = selectedUnit.name;
  renderSummary();
  $('paymentAmount').textContent = ARS(Number(recovered.deposit_amount));
  showPaymentStage(recovered.expires_at);

  $('availability').classList.add('hidden');
  $('bookingFlow').classList.remove('hidden');
  $('formStage').classList.add('hidden');
  $('paymentStage').classList.remove('hidden');
  $('successStage').classList.add('hidden');
  $('step3').classList.add('active');
  $('searchMessage').innerHTML = '<div class="notice"><strong>Recuperamos tu reserva pendiente.</strong> Podés continuar con el pago y cargar el comprobante.</div>';
  $('bookingFlow').scrollIntoView({behavior:'smooth'});
  return true;
}

// Interfaz de pago: el vencimiento real siempre proviene de Supabase.
let paymentCountdownInterval = null;
let paymentExpiry = null;
function setPaymentDeadline(expiresAt) {
  paymentExpiry = Date.parse(expiresAt);
  if (paymentCountdownInterval) clearInterval(paymentCountdownInterval);
  if (!Number.isFinite(paymentExpiry)) return;
  const end = new Date(paymentExpiry).toLocaleString('es-AR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  $('deadlineText').textContent = `Vence el ${end} hs.`;
  const update = () => {
    const left = Math.max(0, Math.ceil((paymentExpiry-Date.now())/1000));
    const hh=String(Math.floor(left/3600)).padStart(2,'0');
    const mm=String(Math.floor((left%3600)/60)).padStart(2,'0');
    const ss=String(left%60).padStart(2,'0');
    $('countdownTime').textContent=`${hh}:${mm}:${ss}`;
    $('paymentHold').classList.toggle('expired',left===0);
    if(left===0){
      $('deadlineText').textContent='El plazo venció. Consultá nuevamente la disponibilidad.';
      $('submitBtn').disabled=true;
      clearInterval(paymentCountdownInterval);
    }
  };
  update();
  paymentCountdownInterval=setInterval(update,1000);
}
function showPaymentFeedback(message,isError=true){
  const el=$('paymentFeedback'); el.textContent=message;
  el.classList.remove('hidden'); el.classList.toggle('error',isError);
  el.classList.toggle('ok',!isError);
}
$('summaryToggle').addEventListener('click', () => {
  const expanded = $('bookingFlow').classList.toggle('summary-expanded');
  $('summaryToggle').setAttribute('aria-expanded', String(expanded));
  $('summaryToggle').textContent = expanded ? 'Ocultar detalle' : 'Ver detalle del precio';
});
$('copyAlias').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('YESO.NIDO.VIENTO');
    $('copyAlias').textContent='¡Copiado!';
    setTimeout(()=>$('copyAlias').textContent='Copiar alias',1800);
  } catch(e) { showPaymentFeedback('No se pudo copiar automáticamente. Mantené presionado el alias para copiarlo.'); }
});
$('proofFile').addEventListener('change',()=>{
  const f=$('proofFile').files[0];
  $('proofSelected').textContent=f ? `Archivo seleccionado: ${f.name}` : '';
  $('paymentFeedback').classList.add('hidden');
});
function showPaymentStage(expiresAt){
  $('bookingFlow').classList.add('payment-active');
  const flow = $('bookingFlow').querySelector('.flow');
  const aside = flow.querySelector('aside');
  if (flow.firstElementChild !== aside) flow.insertBefore(aside, flow.firstElementChild);
  $('paymentSummaryBrief').textContent = `${fmt(selectedQuote.checkin)} al ${fmt(selectedQuote.checkout)} · ${selectedQuote.nights} noche${selectedQuote.nights===1?'':'s'} · ${selectedQuote.guests} huésped${selectedQuote.guests===1?'':'es'}`;
  $('paymentSummaryBrief').classList.remove('hidden');
  $('summaryToggle').classList.remove('hidden');
  $('summaryToggle').setAttribute('aria-expanded','false');
  $('summaryToggle').textContent='Ver detalle del precio';
  $('bookingFlow').classList.remove('summary-expanded');
  setPaymentDeadline(expiresAt);
  $('paymentFeedback').classList.add('hidden');
}
async function init() {
  try {
    const {data,error} = await db.rpc('get_booking_config');
    if(error) throw error;
    config = data;
    $('connText').textContent = 'Supabase conectado ✓';
    $('searchBtn').disabled = false;

    const handledRecovery = await restorePendingBookingFromUrl();
    if(handledRecovery) return;
  } catch(e) {
    $('connText').textContent = 'Error de conexión';
    $('searchMessage').innerHTML = `<div class="notice error"><strong>No pudimos conectar con Supabase.</strong><br>${e.message}</div>`;
  }

  const d = new Date();
  d.setDate(d.getDate()+7);
  $('checkin').value = d.toISOString().slice(0,10);
  setCheckoutDayAfterCheckin();
}

function isoAddDays(iso, days) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

function setCheckoutDayAfterCheckin() {
  const checkin = $('checkin').value;
  if(!checkin) return;
  const nextDay = isoAddDays(checkin, 1);
  $('checkout').min = nextDay;
  $('checkout').value = nextDay;
}

$('checkin').addEventListener('change', setCheckoutDayAfterCheckin);
$('checkout').addEventListener('change', () => {
  const a = $('checkin').value;
  if(!a) return;
  const minOut = isoAddDays(a, 1);
  $('checkout').min = minOut;
  if($('checkout').value < minOut) $('checkout').value = minOut;
});

function validateSearch() {
  const a=$('checkin').value,b=$('checkout').value;
  $('searchMessage').innerHTML='';

  if(!a||!b||b<=a) {
    $('searchMessage').innerHTML='<div class="notice error">Elegí una fecha de ingreso y una salida posterior.</div>';
    return false;
  }

  const nights = nightsBetween(a,b);
  const minimumNights = minimumNightsForCheckin(a);

  if(nights < minimumNights) {
    $('searchMessage').innerHTML =
      `<div class="notice error"><strong>Para estas fechas la estadía mínima es de ${minimumNights} noche${minimumNights!==1?'s':''}.</strong> Elegí una fecha de salida posterior para continuar.</div>`;
    return false;
  }

  return true;
}

$('searchBtn').onclick = async () => {
  $('searchBtn').disabled=true;
  $('searchBtn').textContent='Actualizando tarifas…';
  $('searchMessage').innerHTML='';

  try {
    // V4.1: siempre vuelve a leer unidades y tarifas desde Supabase
    // antes de calcular y mostrar disponibilidad.
    await refreshConfig();

    if(!validateSearch()) return;

    const a=$('checkin').value,b=$('checkout').value,g=+$('guests').value;
    $('searchBtn').textContent='Consultando disponibilidad…';

    const {data,error}=await db.rpc('check_availability',{p_checkin:a,p_checkout:b});
    if(error) throw error;

    const est=localEstimate(a,b,g);
    selectedQuote={checkin:a,checkout:b,guests:g,...est};

    $('stayLabel').textContent = est.lateCheckout
      ? `${fmt(a)} → ${fmt(b)} · 1 noche + late checkout · ${g} huésped${g!==1?'es':''}`
      : `${fmt(a)} → ${fmt(b)} · ${est.nights} noche${est.nights!==1?'s':''} · ${g} huésped${g!==1?'es':''}`;

    if(est.lateCheckout) {
      $('searchMessage').innerHTML = `<div class="notice"><strong>Modalidad 1 noche + late checkout.</strong> Para estadías de una sola noche con ingreso viernes, sábado o domingo se suma un late checkout de <strong>${ARS(est.lateCheckoutAmount)}</strong>. El total que ves abajo ya lo incluye.</div>`;
    }

    availableGalleryUnits = new Set((data || []).filter(x => x.available).map(x => x.unit_id));
    $('unitList').innerHTML=(config.units||[]).map(u=>{
      const av=data.find(x=>x.unit_id===u.id), ok=av&&av.available;
      return `<article class="card unit"><button type="button" class="unit-photo-button" data-gallery="${u.id}" aria-label="Ver fotos de ${u.name}"><img src="${imageMap[u.id]||'assets/exterior.jpg'}" alt="Foto real de ${u.name}"><span class="photo-hint">Ver fotos de la cabaña ↗</span></button><div class="unit-body"><h3>${u.name}</h3><p class="meta">Hasta ${u.capacity} huéspedes · Om Shanti Tigre</p><div class="price">${ARS(est.total)} <span class="small">estimado</span>${est.discountAmount>0?`<div class="small" style="color:#287a50">${est.discountPercent}% de descuento por estadía incluido</div>`:""}</div>${ok?`<button class="btn primary selectUnit" data-unit="${u.id}">Elegir ${u.name.replace('Cabaña ','')}</button>`:'<div class="notice error">No disponible para estas fechas.</div>'}</div></article>`;
    }).join('');

    $('availability').classList.remove('hidden');
    $('bookingFlow').classList.add('hidden');
    document.querySelectorAll('.selectUnit').forEach(btn=>btn.onclick=()=>selectUnit(btn.dataset.unit));
    document.querySelectorAll('[data-gallery]').forEach(btn=>btn.onclick=()=>openGallery(btn.dataset.gallery,btn));
    $('availability').scrollIntoView({behavior:'smooth'});
  } catch(e) {
    $('searchMessage').innerHTML=`<div class="notice error">No pudimos actualizar tarifas/disponibilidad: ${e.message}</div>`;
  } finally {
    $('searchBtn').disabled=false;
    $('searchBtn').textContent='Ver disponibilidad';
  }
};

function selectUnit(id) {
  selectedUnit=config.units.find(u=>u.id===id);
  if(typeof window.fbq === 'function') window.fbq('track', 'InitiateCheckout', {content_category:'alojamiento',currency:'ARS'});
  $('summaryUnit').textContent=selectedUnit.name;
  renderSummary();
  $('bookingFlow').classList.remove('hidden');
  $('formStage').classList.remove('hidden');
  $('paymentStage').classList.add('hidden');
  $('successStage').classList.add('hidden');
  $('bookingFlow').scrollIntoView({behavior:'smooth'});
}

$('continueBtn').onclick=async()=>{
  if(!$('name').value.trim()||!$('email').value.trim()||!$('phone').value.trim()) {
    alert('Completá nombre, email y teléfono.'); return;
  }
  if(!selectedUnit || !selectedQuote) return;

  $('continueBtn').disabled=true;
  $('continueBtn').textContent='Reservando las fechas…';
  try {
    const { data: result, error: createError } = await db.rpc('create_booking_request', {
      p_unit_id: selectedUnit.id,
      p_guest_name: $('name').value.trim(),
      p_guest_email: $('email').value.trim(),
      p_guest_phone: $('phone').value.trim(),
      p_checkin: selectedQuote.checkin,
      p_checkout: selectedQuote.checkout,
      p_guests: selectedQuote.guests,
      p_pet: $('pet').value === 'true',
      p_notes: $('notes').value.trim() || null
    });
    if(createError) throw new Error(createError.message);

    currentPreBooking = result;

    if(result.payment_recovery_token) {
      const recoveryUrl = `${window.location.pathname}?token=${encodeURIComponent(result.payment_recovery_token)}`;
      window.history.replaceState(null, '', recoveryUrl);

      try {
        await triggerBookingEmail(
          result.booking_id,
          'booking_payment_pending',
          null,
          result.payment_recovery_token
        );
      } catch(emailError) {
        console.warn('La pre-reserva se creó, pero falló el email para retomarla:', emailError);
      }
    }

    selectedQuote.originalAmount=Number(result.original_amount??result.total_amount);
    selectedQuote.discountPercent=Number(result.discount_percent||0);
    selectedQuote.discountAmount=Number(result.discount_amount||0);
    selectedQuote.stayDiscountId=result.stay_discount_id||null;
    selectedQuote.total = Number(result.total_amount);
    selectedQuote.deposit = Number(result.deposit_amount);
    selectedQuote.base = Number(result.base_amount);
    selectedQuote.extra = Number(result.extra_guest_amount);
    selectedQuote.lateCheckout = Boolean(result.late_checkout);
    selectedQuote.lateCheckoutAmount = Number(result.late_checkout_amount || 0);
    selectedQuote.depositPercent = Number(result.deposit_percent ?? selectedQuote.depositPercent ?? config.rates.deposit_percent);
    renderSummary();
    $('paymentAmount').textContent = ARS(result.deposit_amount);

    showPaymentStage(result.expires_at);
    $('formStage').classList.add('hidden');
    $('paymentStage').classList.remove('hidden');
    $('step3').classList.add('active');
  } catch(err) {
    alert('No pudimos reservar temporalmente las fechas: ' + err.message);
  } finally {
    $('continueBtn').disabled=false;
    $('continueBtn').textContent='Continuar';
  }
};

$('submitBtn').onclick = async () => {
  if(!currentPreBooking) {
    alert('No encontramos la pre-reserva. Volvé a consultar disponibilidad.');
    return;
  }

  const proof = $('proofFile').files[0];
  if(!proof){
    showPaymentFeedback('Seleccioná un comprobante antes de continuar.');
    return;
  }

  $('submitBtn').disabled=true;
  $('submitBtn').textContent='Subiendo comprobante…';

  try {
    const emailToken = crypto.randomUUID();
    await uploadProof(currentPreBooking.booking_id, proof, emailToken);

    // El email se dispara recién cuando ya recibimos el comprobante.
    // Desde este momento la reserva queda pendiente de verificación, sin vencimiento automático.
    try {
      await triggerBookingEmail(currentPreBooking.booking_id, 'booking_created', emailToken);
    } catch(emailError) {
      console.warn('El comprobante se recibió, pero falló el email automático:', emailError);
    }

    $('bookingId').textContent = currentPreBooking.booking_id;
    window.history.replaceState(null, '', window.location.pathname);
    if(paymentCountdownInterval) clearInterval(paymentCountdownInterval);
    $('bookingFlow').classList.remove('payment-active');
    $('paymentSummaryBrief').classList.add('hidden');
    $('summaryToggle').classList.add('hidden');
    $('paymentStage').classList.add('hidden');
    $('successStage').classList.remove('hidden');
    $('step4').classList.add('active');
    // El comprobante NO equivale a pago confirmado: no enviar Purchase aquí.
    if(typeof window.fbq === 'function') window.fbq('trackCustom', 'BookingProofSubmitted', {booking_status:'pending_verification'});
  } catch(err) {
    showPaymentFeedback('No pudimos completar la solicitud: ' + err.message);
  } finally {
    $('submitBtn').disabled=false;
    $('submitBtn').textContent='Enviar comprobante';
  }
};

init();
