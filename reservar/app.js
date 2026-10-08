
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

async function refreshConfig() {
  const {data,error} = await db.rpc('get_booking_config');
  if(error) throw error;
  config = data;
  return config;
}

function nightsBetween(a,b) {
  return Math.round((new Date(b+'T12:00:00') - new Date(a+'T12:00:00')) / 86400000);
}

function rateForDate(iso) {
  const periods = Array.isArray(config?.rate_periods) ? config.rate_periods : [];

  const matches = periods
    .filter(p => p.start_date <= iso && iso <= p.end_date)
    .sort((a,b) => {
      const byStart = String(b.start_date).localeCompare(String(a.start_date));
      if(byStart !== 0) return byStart;
      return Number(b.id || 0) - Number(a.id || 0);
    });

  return matches[0] || config.rates;
}

function isWeekendOneNight(a,b) {
  const nights = nightsBetween(a,b);
  const dow = new Date(a+'T12:00:00').getDay();
  return nights === 1 && [0,5,6].includes(dow);
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

  const total = base + extra + lateCheckoutAmount;
  const depositPercent = Number(arrivalRate.deposit_percent ?? config.rates.deposit_percent);

  return {
    nights,
    base,
    extra,
    lateCheckout,
    lateCheckoutAmount,
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
    <div class="summary-row total"><span>Total estimado</span><span>${ARS(selectedQuote.total)}</span></div>
    <div class="deposit">Seña estimada (${depositPercent}%)<strong>${ARS(selectedQuote.deposit)}</strong></div>
    <p class="small">El importe definitivo se recalcula en Supabase al enviar.</p>`;
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
    total: Number(recovered.total_amount),
    deposit: Number(recovered.deposit_amount)
  };

  $('summaryUnit').textContent = selectedUnit.name;
  renderSummary();
  $('paymentAmount').textContent = ARS(Number(recovered.deposit_amount));
  $('paymentHold').innerHTML = `<strong>Tu reserva sigue guardada hasta ${new Date(recovered.expires_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' hs'}.</strong><br>Realizá la transferencia y cargá el comprobante antes de ese horario.<br><br><strong>Podés cerrar esta página:</strong> mientras el plazo siga vigente, podés volver a entrar desde el enlace que te enviamos por email.<br><br>Una vez cargado el comprobante, la reserva deja de vencer y queda pendiente de nuestra verificación.`;

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

    $('unitList').innerHTML=(config.units||[]).map(u=>{
      const av=data.find(x=>x.unit_id===u.id), ok=av&&av.available;
      return `<article class="card unit"><img src="${imageMap[u.id]||'assets/exterior.jpg'}" alt="Foto real de ${u.name}"><div class="unit-body"><h3>${u.name}</h3><p class="meta">Hasta ${u.capacity} huéspedes · Om Shanti Tigre</p><div class="price">${ARS(est.total)} <span class="small">estimado</span></div>${ok?`<button class="btn primary selectUnit" data-unit="${u.id}">Elegir ${u.name.replace('Cabaña ','')}</button>`:'<div class="notice error">No disponible para estas fechas.</div>'}</div></article>`;
    }).join('');

    $('availability').classList.remove('hidden');
    $('bookingFlow').classList.add('hidden');
    document.querySelectorAll('.selectUnit').forEach(btn=>btn.onclick=()=>selectUnit(btn.dataset.unit));
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

    selectedQuote.total = Number(result.total_amount);
    selectedQuote.deposit = Number(result.deposit_amount);
    selectedQuote.base = Number(result.base_amount);
    selectedQuote.extra = Number(result.extra_guest_amount);
    selectedQuote.lateCheckout = Boolean(result.late_checkout);
    selectedQuote.lateCheckoutAmount = Number(result.late_checkout_amount || 0);
    selectedQuote.depositPercent = Number(result.deposit_percent ?? selectedQuote.depositPercent ?? config.rates.deposit_percent);
    renderSummary();
    $('paymentAmount').textContent = ARS(result.deposit_amount);

    $('paymentHold').innerHTML = `<strong>Tu fecha queda reservada durante 2 horas, hasta ${new Date(result.expires_at).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' hs'}.</strong><br>Realizá la transferencia y cargá el comprobante antes de ese horario.<br><br><strong>Podés cerrar esta página:</strong> te enviamos por email un enlace para continuar tu reserva dentro de ese plazo.<br><br>Una vez cargado el comprobante, la reserva deja de vencer y queda pendiente de nuestra verificación.`;
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
    alert('Seleccioná el comprobante de transferencia.');
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
    $('paymentStage').classList.add('hidden');
    $('successStage').classList.remove('hidden');
    $('step4').classList.add('active');
  } catch(err) {
    alert('No pudimos completar la solicitud: ' + err.message);
  } finally {
    $('submitBtn').disabled=false;
    $('submitBtn').textContent='Enviar comprobante';
  }
};

init();
