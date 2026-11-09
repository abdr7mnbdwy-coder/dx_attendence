/* =========================================
   Supabase Configuration
   لا يوجد تسجيل دخول في هذا الإصدار
========================================= */

const SUPABASE_URL = "https://drqcamqgghlavbmzgopz.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_iBd7x9LSqEeBCC3UKbWD5g_XALF9Z6W";


/* =========================================
   Working Days
========================================= */

const DAYS = [
  { value: 6, name: "السبت" },
  { value: 0, name: "الأحد" },
  { value: 1, name: "الاثنين" },
  { value: 2, name: "الثلاثاء" },
  { value: 3, name: "الأربعاء" },
  { value: 4, name: "الخميس" }
];


/* =========================================
   Application State
========================================= */

let supabaseClient = null;

let currentMonth = new Date(
  new Date().getFullYear(),
  new Date().getMonth(),
  1
);

let doctors = [];
let replacements = [];
let attendance = []; // سجلات الحضور/الغياب
let daySupervisors = [];
let dirty = false;
let toastTimer;


/* =========================================
   Helpers
========================================= */

const $ = (id) => document.getElementById(id);

const monthKey = (date) => {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
};

const dateKey = (date) => {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
};

const escapeHtml = (value = "") => {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[char];
  });
};

const monthName = (date) => {
  return new Intl.DateTimeFormat("ar-EG", {
    month: "long",
    year: "numeric"
  }).format(date);
};

const formatDate = (value) => {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00`));
};

/* خريطة سريعة: doctor_id|date -> سجل الحضور */
function attendanceMap() {
  const map = {};

  attendance.forEach((record) => {
    map[`${record.doctor_id}|${record.attendance_date}`] = record;
  });

  return map;
}


/* =========================================
   Notifications
========================================= */

function showToast(message, error = false) {
  const toast = $("toast");

  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;

  toast.className = `toast show${error ? " error" : ""}`;

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 3000);
}


/* =========================================
   Connection Status
========================================= */

function setConnection(online, text) {
  const element = $("connectionStatus");

  if (!element) return;

  element.innerHTML = `
    <span class="status-dot ${online ? "online" : ""}"></span>
    <span>${escapeHtml(text)}</span>
  `;
}


/* =========================================
   Save Status
========================================= */

function setDirty(value = true) {
  dirty = value;

  const button = $("saveAll");

  if (!button) return;

  button.innerHTML = value
    ? 'حفظ التغييرات <span>•</span>'
    : 'تم الحفظ <span>✓</span>';
}


/* =========================================
   Get Month Dates
   الجمعة مستبعدة
========================================= */

function getMonthDates() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const dates = [];

  const daysInMonth = new Date(
    year,
    month + 1,
    0
  ).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);

    if (date.getDay() !== 5) {
      dates.push(date);
    }
  }

  return dates;
}


/* =========================================
   Render Calendar Header
========================================= */

function renderHeader() {
  $("monthTitle").textContent = monthName(currentMonth);

  const dates = getMonthDates();

  $("monthSubtitle").textContent =
    `${dates.length} يوم عمل · بدون أيام الجمعة`;

  $("calendarHead").innerHTML = `
    <tr>
      <th>اليوم / الطبيب</th>

      ${dates.map(date => {
        const key = dateKey(date);

        const supervisors = daySupervisors.filter(
          item => item.attendance_date === key
        );

        return `
          <th class="${key === dateKey(new Date()) ? "today-cell" : ""}">
            <div class="calendar-day-head">

              <strong>${date.getDate()}</strong>

              <small>
                ${new Intl.DateTimeFormat("ar-EG", {
                  weekday: "short"
                }).format(date)}
              </small>

              <div class="day-supervisors">
                ${supervisors.map(supervisor => `
                  <div class="supervisor-chip">
                    <span>${escapeHtml(supervisor.supervisor_name)}</span>

                    <button
                      type="button"
                      class="supervisor-action"
                      data-edit-supervisor="${supervisor.id}"
                      title="تعديل اسم المشرف"
                    >✎</button>

                    <button
                      type="button"
                      class="supervisor-action delete"
                      data-delete-supervisor="${supervisor.id}"
                      title="حذف المشرف"
                    >×</button>
                  </div>
                `).join("")}
              </div>

              <button
                type="button"
                class="add-supervisor-btn"
                data-add-supervisor="${key}"
              >
                + إضافة مشرف
              </button>

            </div>
          </th>
        `;
      }).join("")}
    </tr>
  `;

  $("workingDays").textContent = dates.length;
}

/* =========================================
   Render Doctors Calendar
========================================= */

function renderCalendar() {
  renderHeader();

  const body = $("calendarBody");
  const dates = getMonthDates();
  const attMap = attendanceMap();

  const query = $("searchInput")
    .value
    .trim()
    .toLocaleLowerCase("ar");

  let html = "";

  DAYS.forEach(day => {

    const dayDoctors = doctors.filter(doctor => {
      return Number(doctor.weekday) === day.value;
    });

    const filteredDoctors = dayDoctors.filter(doctor => {
      return String(doctor.doctor_name || "")
        .toLocaleLowerCase("ar")
        .includes(query);
    });

    if (!filteredDoctors.length) return;

    html += `
      <tr class="group-row">
        <td colspan="${dates.length + 1}">
          ${day.name}

          <span style="
            font-weight:500;
            color:#8291a5;
          ">
            · ${filteredDoctors.length} طبيب
          </span>
        </td>
      </tr>
    `;

    filteredDoctors.forEach(doctor => {

      html += `
        <tr data-doctor-row="${doctor.id}">

          <td class="doctor-cell">

            <div class="doctor-tools">

<div class="doctor-info">

  <span class="doctor-name">
    ${escapeHtml(doctor.doctor_name)}
  </span>



  ${
    doctor.notes
      ? `<span class="doctor-note">${escapeHtml(doctor.notes)}</span>`
      : ""
  }

</div>

              <button
                class="delete-doctor no-print"
                data-delete-doctor="${doctor.id}"
                title="حذف الطبيب"
              >
                ×
              </button>

            </div>

          </td>

          ${dates.map(date => {

            const scheduled =
              date.getDay() === Number(doctor.weekday);

            const isToday =
              dateKey(date) === dateKey(new Date());

            if (!scheduled) {
              return `
                <td class="
                  outside-cell
                  ${isToday ? "today-cell" : ""}
                "></td>
              `;
            }


const key = `${doctor.id}|${dateKey(date)}`;
const record = attMap[key];
const status = record ? record.status : null;

const canEdit = isAttendanceEditable(date);

const disabledTitle = dateKey(date) > dateKey(new Date())
  ? "لا يمكن تعديل المواعيد المستقبلية"
  : "انتهت مهلة تعديل هذا الموعد (7 أيام)";

            return `
              <td class="
                scheduled-cell
                ${status ? "att-" + status : ""}
                ${isToday ? "today-cell" : ""}
              ">
<button
  type="button"
  class="att-toggle"
  data-att-doctor="${doctor.id}"
  data-att-date="${dateKey(date)}"
  title="اضغط للتبديل: حاضر ✓ ثم غائب ✗ ثم مسح"
>
                  <span class="att-mark">
                    ${status === "present" ? "✓" : status === "absent" ? "✗" : ""}
                  </span>
<span class="att-name">
  ${escapeHtml(doctor.doctor_name)}
</span>

${
  record && record.updated_at
    ? `
      <span class="attendance-update-time" style="
        display: block;
        margin-top: 5px;
        font-size: 10px;
        line-height: 1.5;
        color: #94a3b8;
        white-space: nowrap;
      ">
        آخر تحديث: ${formatLastAttendanceUpdate(record.updated_at)}
      </span>
    `
    : ""
}
                </button>
              </td>
            `;

          }).join("")}

        </tr>
      `;

    });

  });

  body.innerHTML = html;

  const visibleDoctors = doctors.filter(doctor => {
    return String(doctor.doctor_name || "")
      .toLocaleLowerCase("ar")
      .includes(query);
  }).length;

  $("emptySchedule").hidden = doctors.length > 0;

  $("calendarTable").style.display =
    doctors.length ? "table" : "none";

  if (doctors.length && !visibleDoctors) {
    body.innerHTML = `
      <tr>
        <td
          class="no-results"
          colspan="${dates.length + 1}"
        >
          لا توجد نتائج مطابقة لاسم الطبيب.
        </td>
      </tr>
    `;
  }

  $("doctorCount").textContent = doctors.length;

  $("doctorOptions").innerHTML = doctors.map(doctor => `
    <option value="${escapeHtml(doctor.doctor_name)}">
  `).join("");
}


function isAttendanceEditable(date) {
  const dateString = typeof date === "string"
    ? date
    : dateKey(date);

  const [year, month, day] = dateString.split("-").map(Number);

  const selected = Date.UTC(year, month - 1, day);

  const now = new Date();
  const today = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const daysDifference = (today - selected) / 86400000;

  return daysDifference >= 0 && daysDifference < 7;
}

/* =========================================
   Render Replacement Days
========================================= */

function renderReplacements() {

  const query = $("searchInput")
    .value
    .trim()
    .toLocaleLowerCase("ar");

  const filtered = replacements.filter(record => {
    return String(record.doctor_name || "")
      .toLocaleLowerCase("ar")
      .includes(query);
  });

  $("replacementBody").innerHTML = filtered.map((record, index) => {

    return `
      <tr>

        <td>${index + 1}</td>

        <td>
          <strong>
            ${escapeHtml(record.doctor_name)}
          </strong>
        </td>

        <td>
          ${formatDate(record.missed_date)}
        </td>

        <td>
          ${formatDate(record.replacement_date)}
        </td>

        <td>
          ${escapeHtml(record.notes || "—")}
        </td>

        <td class="no-print">

          <button
            class="delete-replacement"
            data-delete-replacement="${record.id}"
          >
            حذف
          </button>

        </td>

      </tr>
    `;

  }).join("");

  $("emptyReplacements").hidden = filtered.length > 0;

  $("replacementCount").textContent = replacements.length;
}


function renderPrintSheet() {
  const sheet = $("printSheet");
  if (!sheet) return;

  const dates = getMonthDates();
const attMap = attendanceMap();
  // تجميع التواريخ حسب أيام الأسبوع
  const byDay = {};

  DAYS.forEach(day => {
    byDay[day.value] = [];
  });

  dates.forEach(date => {
    byDay[date.getDay()].push(date);
  });

  // ترتيب التواريخ من الأقدم إلى الأحدث في DOM
  // لأن الجدول RTL سيظهر الأحدث ناحية اليسار
  Object.values(byDay).forEach(list => {
    list.sort((a, b) => a - b);
  });

  const maxCols = Math.max(
    ...DAYS.map(day => byDay[day.value].length),
    1
  );

  let rows = "";
  let firstGroup = true;

  DAYS.forEach(day => {
    const dayDates = byDay[day.value];

    const list = doctors.filter(doctor =>
      Number(doctor.weekday) === Number(day.value)
    );

    if (!list.length) return;

    // صف عناوين التواريخ لكل يوم
    const dateHeaders = [];

    for (let col = 0; col < maxCols; col++) {
      const date = dayDates[col];

      dateHeaders.push(`
        <th class="print-date-header">
          ${date ? date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short"
          }).replace(" ", "-") : ""}
        </th>
      `);
    }

    rows += `
      <tr class="print-date-row">
        ${firstGroup ? `
          <th class="print-day-header">Day</th>
          <th class="print-doctor-header">PERIO</th>
        ` : `
          <th class="print-day-header empty-header"></th>
          <th class="print-doctor-header empty-header"></th>
        `}

        ${dateHeaders.join("")}
      </tr>
    `;

    // صفوف الأطباء
    list.forEach((doctor, index) => {
      rows += `
        <tr class="print-doctor-row">

          ${index === 0 ? `
            <td class="print-day-name"
                rowspan="${list.length}">
              ${escapeHtml(day.name)}
            </td>
          ` : ""}

          <td class="print-doctor-name">
            ${escapeHtml(doctor.doctor_name)}
          </td>

${Array.from({ length: maxCols }, (_, col) => {
  const date = dayDates[col];

  if (!date) {
    return `<td class="print-attendance-cell"></td>`;
  }

  const record = attMap[`${doctor.id}|${dateKey(date)}`];

  let mark = "";

  if (record?.status === "present") {
    mark = `<span class="print-present-mark">✓</span>`;
  } else if (record?.status === "absent") {
    mark = `<span class="print-absent-mark">✗</span>`;
  }

  return `
    <td class="print-attendance-cell">
      ${mark}
    </td>
  `;
}).join("")}

        </tr>
      `;
    });

    firstGroup = false;
  });

const replacementRows = replacements
  .slice()
  .sort((a, b) =>
    String(a.replacement_date).localeCompare(
      String(b.replacement_date)
    )
  )
  .map((record, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(record.doctor_name)}</td>
      <td>
        ${record.missed_date
          ? formatDate(record.missed_date)
          : "—"}
      </td>
      <td>${formatDate(record.replacement_date)}</td>
      <td>${escapeHtml(record.notes || "—")}</td>
    </tr>
  `)
  .join("");

sheet.innerHTML = `
  <div class="print-title">
    <h2>Diagnosis — ${monthName(currentMonth)}</h2>
  </div>

  <table class="print-table">
    <colgroup>
      <col class="col-day">
      <col class="col-doctor">
      ${Array.from(
        { length: maxCols },
        () => '<col class="col-date">'
      ).join("")}
    </colgroup>

    <tbody>
      ${rows}
    </tbody>
  </table>

  ${
    replacements.length
      ? `
        <div class="print-replacements-section">

          <h3 class="print-replacements-title">
            Replacement Days — أيام التعويض
          </h3>

          <table class="print-replacements-table">

            <thead>
              <tr>
                <th>#</th>
                <th>Doctor</th>
                <th>Missed Date</th>
                <th>Replacement Date</th>
                <th>Notes</th>
              </tr>
            </thead>

            <tbody>
              ${replacementRows}
            </tbody>

          </table>

        </div>
      `
      : ""
  }
`;
}
/* =========================================
   Render Everything
========================================= */

function renderAll() {
  renderCalendar();
  renderReplacements();
  renderPrintSheet();

  $("presentCount").textContent =
    attendance.filter(r => r.status === "present").length;

  $("absentCount").textContent =
    attendance.filter(r => r.status === "absent").length;
}


/* =========================================
   Load Month From Supabase
   بدون تسجيل دخول
========================================= */

async function loadMonth() {

  if (!supabaseClient) {
    showToast("اتصال Supabase غير جاهز.", true);
    return;
  }

  setConnection(true, "متصل بقاعدة البيانات");

  const key = monthKey(currentMonth);

  try {

const [
  doctorResult,
  replacementResult,
  attendanceResult,
  supervisorResult
] = await Promise.all([
  supabaseClient
    .from("clinic_attendance_doctors")
    .select("*")
    .eq("month_key", key)
    .order("weekday")
    .order("created_at"),

  supabaseClient
    .from("clinic_attendance_replacements")
    .select("*")
    .eq("month_key", key)
    .order("replacement_date"),

  supabaseClient
    .from("clinic_attendance_records")
    .select("*")
    .eq("month_key", key)
    .order("attendance_date"),

  supabaseClient
    .from("clinic_attendance_day_supervisors")
    .select("*")
    .eq("month_key", key)
    .order("attendance_date")
]);

    if (doctorResult.error) {
      throw doctorResult.error;
    }

    if (replacementResult.error) {
      throw replacementResult.error;
    }

    if (attendanceResult.error) {
      throw attendanceResult.error;
    }
    if (supervisorResult.error) {
  throw supervisorResult.error;
}

    doctors = doctorResult.data || [];

    replacements = replacementResult.data || [];

    attendance = attendanceResult.data || [];

    daySupervisors = supervisorResult.data || [];

    setDirty(false);

    renderAll();

    setConnection(true, "متصل بقاعدة البيانات");

  } catch (error) {

    console.error("Load error:", error);

    setConnection(false, "خطأ في الاتصال");

    showToast(
      error.message || "تعذر تحميل البيانات. راجع إعدادات Supabase وSQL.",
      true
    );

  }

}


/* =========================================
   Add Doctor
========================================= */

async function saveDoctor(name, weekday, notes) {

  name = String(name || "").trim();

  if (!name) {
    throw new Error("يرجى إدخال اسم الطبيب.");
  }

  const { data, error } = await supabaseClient
    .from("clinic_attendance_doctors")
    .insert({
      month_key: monthKey(currentMonth),
      doctor_name: name,
      weekday: Number(weekday),
      notes: String(notes || "").trim() || null
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  doctors.push(data);

  setDirty(false);

  renderAll();

  return data;
}


/* =========================================
   Add Replacement
========================================= */

async function saveReplacement(payload) {

  const name = String(payload.name || "").trim();

  if (!name) {
    throw new Error("يرجى اختيار اسم الطبيب.");
  }

  if (!payload.replacement) {
    throw new Error("يرجى تحديد تاريخ التعويض.");
  }

  const { data, error } = await supabaseClient
    .from("clinic_attendance_replacements")
    .insert({

      month_key: monthKey(currentMonth),

      doctor_name: name,

      missed_date: payload.missed || null,

      replacement_date: payload.replacement,

      notes: String(payload.notes || "").trim() || null

    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  replacements.push(data);

  renderAll();

  return data;
}


/* =========================================
   Toggle Attendance
   لا شيء -> حاضر -> غائب -> لا شيء
========================================= */

async function toggleAttendance(doctorId, date) {

  if (!supabaseClient) {
    showToast("اتصال Supabase غير جاهز.", true);
    return;
  }

  // =================================
  // منع تعديل التواريخ غير المسموحة
  // =================================

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDate = new Date(date + "T00:00:00");

  const daysDifference = Math.floor(
    (today.getTime() - selectedDate.getTime()) /
    (1000 * 60 * 60 * 24)
  );

  if (isNaN(selectedDate.getTime())) {
    showToast("التاريخ غير صالح.", true);
    return;
  }

  if (daysDifference < 0) {
    showToast("لا يمكن تسجيل أو تعديل الحضور في تاريخ مستقبلي.", true);
    return;
  }

  if (daysDifference >= 7) {
    showToast("لا يمكن تعديل الحضور بعد مرور 7 أيام أو أكثر.", true);
    return;
  }

  // =================================
  // تحديد الحالة الجديدة
  // =================================

  const existing = attendance.find(record => {
    return (
      String(record.doctor_id) === String(doctorId) &&
      record.attendance_date === date
    );
  });

  const nextStatus = !existing
    ? "present"
    : existing.status === "present"
      ? "absent"
      : null;

  const updatedAt = new Date().toISOString();

  try {

    if (!nextStatus) {

      // مسح التسجيل
      const { error } = await supabaseClient
        .from("clinic_attendance_records")
        .delete()
        .eq("id", existing.id);

      if (error) throw error;

      attendance = attendance.filter(record => {
        return String(record.id) !== String(existing.id);
      });

    } else if (existing) {

      // تحديث الحالة ووقت آخر تعديل
      const { data, error } = await supabaseClient
        .from("clinic_attendance_records")
        .update({
          status: nextStatus,
          updated_at: updatedAt
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;

      Object.assign(existing, data);

    } else {

      // تسجيل جديد
      const { data, error } = await supabaseClient
        .from("clinic_attendance_records")
        .insert({
          month_key: monthKey(currentMonth),
          doctor_id: doctorId,
          attendance_date: date,
          status: nextStatus,
          updated_at: updatedAt
        })
        .select()
        .single();

      if (error) throw error;

      attendance.push(data);
    }

    
const { error: doctorUpdateError } = await supabaseClient
  .from("clinic_attendance_doctors")
  .update({
    last_attendance_update_at: updatedAt
  })
  .eq("id", doctorId);

if (doctorUpdateError) throw doctorUpdateError;

// تحديث البيانات المحلية
const doctor = doctors.find(
  d => String(d.id) === String(doctorId)
);

if (doctor) {
  doctor.last_attendance_update_at = updatedAt;
}


    renderAll();

    showToast(
      nextStatus === "present"
        ? "تم تسجيل الحضور ✓"
        : nextStatus === "absent"
          ? "تم تسجيل الغياب ✗"
          : "تم مسح التسجيل"
    );

  } catch (error) {

    console.error(error);

    showToast(
      error.message || "تعذر حفظ تسجيل الحضور.",
      true
    );

  }
}



function formatLastAttendanceUpdate(date) {

  if (!date) return "لم يتم تسجيل أي تحديث";

  return new Date(date).toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function deleteRecord(table, id) {
  const { error } = await supabaseClient
    .from(table)
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// =========================================
// Day Supervisors
// =========================================

async function addDaySupervisor(date, name) {
  name = String(name || "").trim();

  if (!name) {
    showToast("يرجى إدخال اسم المشرف.", true);
    return;
  }

  const exists = daySupervisors.some(item =>
    item.attendance_date === date &&
    item.supervisor_name.trim() === name
  );

  if (exists) {
    showToast("هذا المشرف مسجل بالفعل في هذا اليوم.", true);
    return;
  }

  const { data, error } = await supabaseClient
    .from("clinic_attendance_day_supervisors")
    .insert({
      month_key: monthKey(currentMonth),
      attendance_date: date,
      supervisor_name: name
    })
    .select()
    .single();

  if (error) throw error;

  daySupervisors.push(data);

  renderHeader();

  showToast("تمت إضافة المشرف بنجاح.");
}


async function editDaySupervisor(id, name) {
  name = String(name || "").trim();

  if (!name) {
    showToast("اسم المشرف لا يمكن أن يكون فارغًا.", true);
    return;
  }

  const current = daySupervisors.find(
    item => String(item.id) === String(id)
  );

  if (!current) return;

  const exists = daySupervisors.some(item =>
    String(item.id) !== String(id) &&
    item.attendance_date === current.attendance_date &&
    item.supervisor_name.trim() === name
  );

  if (exists) {
    showToast("هذا الاسم موجود بالفعل في اليوم نفسه.", true);
    return;
  }

  const { data, error } = await supabaseClient
    .from("clinic_attendance_day_supervisors")
    .update({ supervisor_name: name })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  daySupervisors = daySupervisors.map(item =>
    String(item.id) === String(id) ? data : item
  );

  renderHeader();

  showToast("تم تعديل اسم المشرف.");
}


async function deleteDaySupervisor(id) {
  const { error } = await supabaseClient
    .from("clinic_attendance_day_supervisors")
    .delete()
    .eq("id", id);

  if (error) throw error;

  daySupervisors = daySupervisors.filter(
    item => String(item.id) !== String(id)
  );

  renderHeader();

  showToast("تم حذف المشرف.");
}

/* =========================================
   Save / Synchronize
========================================= */

async function saveAll() {

  await loadMonth();

  showToast("البيانات محفوظة ومزامنة مع Supabase.");

}


/* =========================================
   Dialog Controls
========================================= */

function openDialog(id) {
  $(id).showModal();
}

function closeDialog(id) {
  $(id).close();
}


/* =========================================
   Initialize Events
========================================= */

function initEvents() {

  // Previous month

  $("prevMonth").addEventListener("click", async () => {

    currentMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 1,
      1
    );

    await loadMonth();

  });


  // Next month

  $("nextMonth").addEventListener("click", async () => {

    currentMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      1
    );

    await loadMonth();

  });


  // Current month

  $("currentMonth").addEventListener("click", async () => {

    const today = new Date();

    currentMonth = new Date(
      today.getFullYear(),
      today.getMonth(),
      1
    );

    await loadMonth();

  });


  // Add doctor

  $("addDoctor").addEventListener("click", () => {
    openDialog("doctorDialog");
  });

  $("emptyAddDoctor").addEventListener("click", () => {
    openDialog("doctorDialog");
  });


  // Add replacement

  $("addReplacement").addEventListener("click", () => {
    openDialog("replacementDialog");
  });


  // Close dialogs

  document.querySelectorAll("[data-close]").forEach(button => {

    button.addEventListener("click", () => {
      closeDialog(button.dataset.close);
    });

  });


  // Doctor form

  $("doctorForm").addEventListener("submit", async (event) => {

    event.preventDefault();

    try {

      await saveDoctor(
        $("doctorName").value,
        $("doctorWeekday").value,
        $("doctorNotes").value
      );

      event.target.reset();

      closeDialog("doctorDialog");

      showToast("تمت إضافة الطبيب إلى الجدول.");

    } catch (error) {

      console.error(error);

      showToast(
        error.message || "تعذرت إضافة الطبيب.",
        true
      );

    }

  });


  // Replacement form

  $("replacementForm").addEventListener("submit", async (event) => {

    event.preventDefault();

    const replacement = $("replacementDate").value;

    const missed = $("missedDate").value;

    if (!replacement) {

      showToast("يرجى تحديد تاريخ التعويض.", true);

      return;

    }

    if (missed && missed === replacement) {

      showToast(
        "يجب أن يختلف تاريخ التعويض عن يوم الغياب.",
        true
      );

      return;

    }

    try {

      await saveReplacement({

        name: $("replacementDoctor").value,

        missed: missed,

        replacement: replacement,

        notes: $("replacementNotes").value

      });

      event.target.reset();

      closeDialog("replacementDialog");

      showToast("تم تسجيل يوم التعويض.");

    } catch (error) {

      console.error(error);

      showToast(
        error.message || "تعذر تسجيل التعويض.",
        true
      );

    }

  });


  // Calendar clicks: toggle attendance / delete doctor

  $("calendarBody").addEventListener("click", async (event) => {

    // Toggle attendance
    const toggleButton =
      event.target.closest("[data-att-doctor]");

    if (toggleButton) {
      await toggleAttendance(
        toggleButton.dataset.attDoctor,
        toggleButton.dataset.attDate
      );
      return;
    }

    // Delete doctor
    const button = event.target.closest("[data-delete-doctor]");

    if (!button) return;

    if (!confirm("هل تريد حذف هذا الطبيب من جدول الشهر؟")) {
      return;
    }

    const id = button.dataset.deleteDoctor;

    try {

      await deleteRecord(
        "clinic_attendance_doctors",
        id
      );

      doctors = doctors.filter(doctor => {
        return String(doctor.id) !== String(id);
      });

      attendance = attendance.filter(record => {
        return String(record.doctor_id) !== String(id);
      });

      renderAll();

      showToast("تم حذف الطبيب.");

    } catch (error) {

      console.error(error);

      showToast(
        error.message || "تعذر حذف الطبيب.",
        true
      );

    }

  });


  // Delete replacement

  $("replacementBody").addEventListener("click", async (event) => {

    const button = event.target.closest("[data-delete-replacement]");

    if (!button) return;

    if (!confirm("هل تريد حذف سجل التعويض؟")) {
      return;
    }

    const id = button.dataset.deleteReplacement;

    try {

      await deleteRecord(
        "clinic_attendance_replacements",
        id
      );

      replacements = replacements.filter(record => {
        return String(record.id) !== String(id);
      });

      renderReplacements();

      showToast("تم حذف سجل التعويض.");

    } catch (error) {

      console.error(error);

      showToast(
        error.message || "تعذر حذف سجل التعويض.",
        true
      );

    }

  });


  // Search

  $("searchInput").addEventListener("input", renderAll);


  // Clear search

  $("clearSearch").addEventListener("click", () => {

    $("searchInput").value = "";

    renderAll();

    $("searchInput").focus();

  });


  // Print

  $("printMonth").addEventListener("click", () => {
    window.print();
  });


  // Save / refresh

  $("saveAll").addEventListener("click", saveAll);

  // =========================================
// Day Supervisors Events
// =========================================

$("calendarHead").addEventListener("click", async event => {

  const addButton = event.target.closest("[data-add-supervisor]");

  const editButton = event.target.closest("[data-edit-supervisor]");

  const deleteButton = event.target.closest("[data-delete-supervisor]");

  try {

    // Add supervisor
    if (addButton) {
      const date = addButton.dataset.addSupervisor;

      const name = prompt("أدخل اسم المشرف:");

      if (name === null) return;

      await addDaySupervisor(date, name);
      return;
    }

    // Edit supervisor
    if (editButton) {
      const id = editButton.dataset.editSupervisor;

      const supervisor = daySupervisors.find(
        item => String(item.id) === String(id)
      );

      if (!supervisor) return;

      const name = prompt(
        "تعديل اسم المشرف:",
        supervisor.supervisor_name
      );

      if (name === null) return;

      await editDaySupervisor(id, name);
      return;
    }

    // Delete supervisor
    if (deleteButton) {
      const id = deleteButton.dataset.deleteSupervisor;

      if (!confirm("هل تريد حذف هذا المشرف؟")) return;

      await deleteDaySupervisor(id);
    }

  } catch (error) {
    console.error(error);

    showToast(
      error.message || "حدث خطأ أثناء تعديل المشرفين.",
      true
    );
  }

});

}


/* =========================================
   Initialize Application
========================================= */

async function init() {

  initEvents();

  renderHeader();

  try {

    if (
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY ||
      SUPABASE_URL.includes("YOUR_SUPABASE_URL") ||
      SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")
    ) {

      setConnection(false, "راجع إعدادات Supabase");

      showToast("بيانات Supabase غير مكتملة.", true);

      return;

    }

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {

      setConnection(false, "تعذر تحميل Supabase");

      showToast(
        "مكتبة Supabase لم يتم تحميلها. تحقق من اتصال الإنترنت وملف HTML.",
        true
      );

      return;

    }

    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    // لا يوجد getSession أو تسجيل دخول

    await loadMonth();

  } catch (error) {

    console.error("Initialization error:", error);

    setConnection(false, "خطأ في تشغيل التطبيق");

    showToast(
      error.message || "حدث خطأ أثناء تشغيل التطبيق.",
      true
    );

  }

}


document.addEventListener("DOMContentLoaded", init);