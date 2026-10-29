import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router';

const coursePath = (courseId, detail = 'participants') => `/courses/${encodeURIComponent(courseId)}/${detail}`;

function errorMessage(error) {
  const messages = {
    400: 'La solicitud no tiene un formato válido.',
    401: 'La sesión de Moodle venció. Vuelve a iniciar sesión.',
    403: 'Tu usuario no tiene acceso efectivo a este curso.',
    404: 'Este curso aún no tiene datos sincronizados.',
    502: 'Moodle no pudo entregar una respuesta completa.',
    503: 'El servicio o la base auxiliar no está disponible.',
    504: 'Moodle tardó demasiado en responder. Intenta de nuevo.',
  };
  return messages[error?.status] || error?.message || 'No fue posible completar la solicitud.';
}

function formatDate(value) {
  if (!value) return 'Aún no sincronizado';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return 'Sin nota visible';
  return new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 }).format(Number(value));
}

function evaluableActivityCount(snapshot) {
  return (snapshot?.activities ?? []).reduce((total, section) =>
    total + (section.modules ?? []).filter((module) => module.modname === 'assign').length, 0);
}

function App() {
  const navigate = useNavigate();
  const [token, setToken] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [courses, setCourses] = useState([]);
  const [syncByCourse, setSyncByCourse] = useState({});
  const [busy, setBusy] = useState(() => new Set());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const request = useCallback(async (path, options = {}, requestToken = token) => {
    const headers = new Headers(options.headers ?? {});
    if (requestToken) headers.set('Authorization', `Bearer ${requestToken}`);
    const response = await fetch(path, { ...options, headers, cache: 'no-store' });
    const type = response.headers.get('content-type') ?? '';
    const body = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const error = new Error(errorMessage({ status: response.status }));
      error.status = response.status;
      error.code = typeof body === 'object' && body ? body.error : '';
      if (response.status === 401 && requestToken) {
        setToken(null);
        setIdentity(null);
        setCourses([]);
        setSyncByCourse({});
        setError('Tu sesión expiró. Inicia sesión otra vez para continuar.');
        navigate('/login', { replace: true });
      }
      throw error;
    }
    return body;
  }, [token, navigate]);

  const updateSync = useCallback((courseId, value) => {
    setSyncByCourse((current) => ({ ...current, [String(courseId)]: value }));
  }, []);

  const loadCourseStatus = useCallback(async (course, requestToken = token) => {
    updateSync(course.id, { status: 'loading', snapshot: null });
    try {
      const snapshot = await request(`/academic/api/courses/${encodeURIComponent(course.id)}/data`, {}, requestToken);
      const result = { status: 'ready', snapshot };
      updateSync(course.id, result);
      return result;
    } catch (loadError) {
      if (loadError.status === 404) {
        const result = { status: 'pending', snapshot: null };
        updateSync(course.id, result);
        return result;
      }
      const result = {
        status: loadError.status === 403 ? 'blocked' : 'error',
        snapshot: null,
        message: errorMessage(loadError),
      };
      updateSync(course.id, result);
      return result;
    }
  }, [request, token, updateSync]);

  const signIn = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get('username') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setError('');
    setNotice('');
    setBusy((current) => new Set(current).add('login'));
    try {
      const body = new URLSearchParams({ username, password, service: 'edumonitor' });
      const login = await request('/moodle/login/token.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }, null);
      if (!login.token) throw new Error(login.error || 'Moodle no aceptó estas credenciales.');
      const access = await request('/access/api/access/me', {}, login.token);
      if (!Array.isArray(access.courses) || access.courses.length === 0) {
        throw new Error('Esta cuenta no tiene cursos autorizados para consultar.');
      }
      setToken(login.token);
      setIdentity(access);
      setCourses(access.courses);
      setSyncByCourse({});
      await Promise.all(access.courses.map((course) => loadCourseStatus(course, login.token)));
      navigate(coursePath(access.courses[0].id), { replace: true });
    } catch (loginError) {
      setToken(null);
      setIdentity(null);
      setCourses([]);
      setError(errorMessage(loginError));
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete('login');
        return next;
      });
    }
  };

  const signOut = () => {
    setToken(null);
    setIdentity(null);
    setCourses([]);
    setSyncByCourse({});
    setError('');
    setNotice('');
    navigate('/login', { replace: true });
  };

  const syncCourse = async (course) => {
    const key = String(course.id);
    setBusy((current) => new Set(current).add(key));
    setError('');
    setNotice('');
    updateSync(course.id, { status: 'syncing', snapshot: syncByCourse[key]?.snapshot ?? null });
    try {
      await request(`/academic/api/courses/${encodeURIComponent(course.id)}/sync`, { method: 'POST' });
      const refreshed = await loadCourseStatus(course);
      if (refreshed.status !== 'ready') throw new Error(refreshed.message || 'La sincronización terminó, pero no se pudo leer la copia local.');
      setNotice(`Datos de ${course.name} actualizados desde Moodle.`);
    } catch (syncError) {
      const message = errorMessage(syncError);
      updateSync(course.id, { status: syncError.status === 403 ? 'blocked' : 'error', snapshot: null, message });
      setError(message);
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const syncAll = async () => {
    for (const course of courses) await syncCourse(course);
  };

  const dashboardContext = useMemo(() => ({
    token, identity, courses, syncByCourse, busy, error, notice,
    setError, setNotice, syncCourse, syncAll, signOut,
  }), [token, identity, courses, syncByCourse, busy, error, notice, syncCourse, syncAll, signOut]);

  const firstCourse = courses[0];
  const defaultPath = token && firstCourse ? coursePath(firstCourse.id) : '/login';

  return (
    <Routes>
      <Route path="/" element={<Navigate to={defaultPath} replace />} />
      <Route path="/login" element={<LoginPage token={token} defaultPath={defaultPath} error={error} busy={busy} onSignIn={signIn} />} />
      <Route element={token ? <DashboardLayout context={dashboardContext} /> : <Navigate to="/login" replace />}>
        <Route path="/courses/:courseId/participants" element={<CoursePage detail="participants" />} />
        <Route path="/courses/:courseId/grades" element={<GradeRoute />} />
        <Route path="/courses/:courseId/grades/:studentId" element={<CoursePage detail="grades" />} />
        <Route path="/courses/:courseId/content" element={<CoursePage detail="content" />} />
        <Route path="/synced" element={<SyncedPage />} />
      </Route>
      <Route path="*" element={<Navigate to={defaultPath} replace />} />
    </Routes>
  );
}

function LoginPage({ token, defaultPath, error, busy, onSignIn }) {
  if (token) return <Navigate to={defaultPath} replace />;
  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-brand"><BrandMark /><BrandName /></div>
        <div className="login-copy"><span className="eyebrow">ESPACIO DOCENTE</span><h1>Seguimiento académico,<br /><em>conectado a Moodle.</em></h1><p>Inicia sesión con tu cuenta docente para revisar cursos y datos autorizados.</p></div>
        {error && <div className="alert alert-error" role="alert"><span aria-hidden="true">!</span>{error}</div>}
        <form className="login-form" onSubmit={onSignIn}>
          <label htmlFor="username">Correo o usuario Moodle</label><div className="input-wrap"><span className="input-icon" aria-hidden="true">@</span><input id="username" name="username" type="text" autoComplete="username" placeholder="docente@institucion.edu" required /></div>
          <div className="password-label"><label htmlFor="password">Contraseña</label><span>Autenticación Moodle</span></div><div className="input-wrap"><span className="input-icon" aria-hidden="true">⌑</span><input id="password" name="password" type="password" autoComplete="current-password" placeholder="Ingresa tu contraseña" required /></div>
          <button className="button button-primary login-submit" type="submit" disabled={busy.has('login')}>{busy.has('login') ? <><span className="spinner" /> Verificando acceso</> : <>Ingresar al espacio docente <span aria-hidden="true">→</span></>}</button>
        </form>
        <div className="login-foot"><span className="lock-icon" aria-hidden="true">⌑</span><span>Solo verás cursos con permisos docentes activos en Moodle.</span></div>
      </section>
      <aside className="login-aside"><div className="aside-grid" /><div className="aside-content"><div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" /><div className="aside-art"><div className="art-line line-one" /><div className="art-line line-two" /><div className="art-line line-three" /><div className="art-node node-one">01</div><div className="art-node node-two">02</div><div className="art-node node-three">03</div><div className="art-core"><span className="core-spark">✳</span></div></div><span className="eyebrow">EDUMONITOR · SPRINT N1</span><h2>Una vista clara<br />de la información<br /><em>de tus cursos.</em></h2><p>Acceso controlado, datos sincronizados y calificaciones provenientes de Moodle.</p><div className="aside-footer"><span className="environment-dot" />Instancia de prueba · Datos ficticios</div></div></aside>
    </main>
  );
}

function DashboardLayout({ context }) {
  const location = useLocation();
  const { courses, syncByCourse, identity, signOut, error, notice, setError, setNotice } = context;
  const params = location.pathname.match(/^\/courses\/([^/]+)/);
  const selectedCourse = params
    ? courses.find((course) => String(course.id) === decodeURIComponent(params[1]))
    : null;
  const info = selectedCourse ? syncByCourse[String(selectedCourse.id)] ?? { status: 'loading' } : null;
  const isSynced = location.pathname === '/synced';
  const homePath = courses.length ? coursePath(courses[0].id) : '/login';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to={homePath} aria-label="EduMonitor AI, inicio"><BrandMark /><BrandName /></Link>
        <div className="topbar-right"><span className="environment-tag"><span className="environment-dot" />Moodle de prueba</span><span className="topbar-divider" /><div className="user-chip"><span className="avatar">{(identity?.name ?? 'D').trim().charAt(0).toUpperCase()}</span><span>{identity?.name ?? 'Docente'}</span></div><button className="button button-quiet button-small" onClick={signOut}>Cerrar sesión</button></div>
      </header>
      <div className="page-context"><div><span className="eyebrow">ESPACIO DOCENTE · SPRINT N1</span><h1>{isSynced ? 'Datos sincronizados' : 'Cursos y conexión'}</h1></div>{selectedCourse && <div className="context-course"><span className="context-label">CURSO ACTIVO</span><strong>{selectedCourse.name}</strong><StatusPill status={info?.status} /></div>}</div>
      <main className="main-content">
        <div className="alert-stack" aria-live="polite">
          {error && <div className="alert alert-error"><span aria-hidden="true">!</span>{error}<button className="alert-close" aria-label="Cerrar" onClick={() => setError('')}>×</button></div>}
          {notice && <div className="alert alert-success"><span aria-hidden="true">✓</span>{notice}<button className="alert-close" aria-label="Cerrar" onClick={() => setNotice('')}>×</button></div>}
        </div>
        <nav className="primary-tabs" aria-label="Secciones principales">
          <Link className={`primary-tab ${location.pathname.startsWith('/courses/') ? 'active' : ''}`} to={homePath}><span className="nav-icon">▦</span>Cursos</Link>
          <NavLink className={({ isActive }) => `primary-tab ${isActive ? 'active' : ''}`} to="/synced"><span className="nav-icon">↻</span>Datos sincronizados <span className="tab-count">{courses.length}</span></NavLink>
        </nav>
        <Outlet context={context} />
        <footer className="app-footer"><span>EduMonitor AI</span><span>Moodle es la fuente oficial de calificaciones</span><span>Los datos de esta instancia son ficticios</span></footer>
      </main>
    </div>
  );
}

function useDashboard() {
  return useOutletContext();
}

function CoursePage({ detail }) {
  const { courseId, studentId } = useParams();
  const navigate = useNavigate();
  const { courses, syncByCourse, busy, syncCourse, setError, setNotice } = useDashboard();
  const course = courses.find((entry) => String(entry.id) === String(courseId));
  if (!course) return <Navigate to={courses.length ? coursePath(courses[0].id) : '/login'} replace />;
  const info = syncByCourse[String(course.id)] ?? { status: 'loading', snapshot: null };
  const snapshot = info.snapshot;
  const students = snapshot?.students ?? [];
  const currentStudent = students.find((student) => String(student.id) === String(studentId)) ?? students[0];

  const openDetail = (target) => {
    const path = target === 'grades'
      ? `/courses/${encodeURIComponent(course.id)}/grades/${encodeURIComponent(currentStudent?.id ?? '')}`
      : coursePath(course.id, target);
    navigate(path);
  };

  const onCourseChange = (event) => {
    setError('');
    setNotice('');
    navigate(coursePath(event.currentTarget.value));
  };

  return (
    <>
      <section className="course-toolbar">
        <label className="select-label">Curso autorizado<select value={course.id} onChange={onCourseChange}>{courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="toolbar-copy"><span className="eyebrow">DATOS DE MOODLE</span><strong>{snapshot ? `${snapshot.students.length} estudiantes · ${evaluableActivityCount(snapshot)} tareas evaluables` : 'Selecciona cuándo actualizar el curso'}</strong></div>
      </section>
      <ConnectionCard course={course} info={info} busy={busy} courseCount={courses.length} onSync={() => syncCourse(course)} />
      <section className="data-card">
        <div className="detail-tabs" role="tablist" aria-label="Información del curso">
          <DetailTab course={course} selected={detail === 'participants'} target="participants">Participantes</DetailTab>
          <DetailTab course={course} selected={detail === 'grades'} target={currentStudent ? `grades/${encodeURIComponent(currentStudent.id)}` : 'grades'}>Calificaciones</DetailTab>
          <DetailTab course={course} selected={detail === 'content'} target="content">Contenido del curso</DetailTab>
        </div>
        <div className="detail-content">
          {detail === 'grades' ? <StudentGrades snapshot={snapshot} studentId={studentId ?? currentStudent?.id} course={course} />
            : detail === 'content' ? <CourseContent snapshot={snapshot} />
              : <Roster snapshot={snapshot} course={course} />}
        </div>
      </section>
    </>
  );
}

function DetailTab({ course, target, selected, children }) {
  const to = target.startsWith('grades') ? `/courses/${encodeURIComponent(course.id)}/${target}` : coursePath(course.id, target);
  return <Link className={`detail-tab ${selected ? 'active' : ''}`} role="tab" aria-selected={selected} to={to}>{children}</Link>;
}

function ConnectionCard({ course, info, busy, courseCount, onSync }) {
  const isBusy = busy.has(String(course.id));
  const latest = info.snapshot;
  const disabled = info.status === 'syncing' || info.status === 'loading';
  return (
    <section className="connection-card">
      <div className="connection-main"><span className="connection-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7.7 17.2h9.1a4.1 4.1 0 0 0 .5-8.2A5.4 5.4 0 0 0 7 7.5a4.8 4.8 0 0 0 .7 9.7Z" /><path d="m9.2 12.1 1.8 1.8 3.9-4" /></svg></span><div><h2>Conexión con Moodle</h2><p>Servicios web autenticados · datos oficiales de solo lectura</p></div></div>
      <div className="connection-meta"><span className="connection-led" /><span>Sesión verificada</span><span className="meta-separator">·</span><span>{courseCount} {courseCount === 1 ? 'curso autorizado' : 'cursos autorizados'}</span></div>
      <div className="connection-last"><span>Última sincronización</span><strong>{formatDate(latest?.syncedAt)}</strong></div>
      <div className="connection-actions"><button className="button button-primary" onClick={onSync} disabled={disabled || isBusy}>{isBusy ? <><span className="spinner" /> Sincronizando</> : <><span className="button-icon">↻</span> Sincronizar ahora</>}</button><Link className="button button-secondary" to="/synced">Ver datos sincronizados <span aria-hidden="true">→</span></Link></div>
    </section>
  );
}

function StatusPill({ status }) {
  const values = {
    ready: ['Listo', 'success'], pending: ['Pendiente', 'muted'], loading: ['Consultando', 'muted'],
    syncing: ['Sincronizando', 'working'], blocked: ['Sin acceso', 'danger'], error: ['Con error', 'danger'],
  };
  const [label, className] = values[status] ?? ['Desconocido', 'muted'];
  return <span className={`status-pill status-${className}`}><span className="status-dot" />{label}</span>;
}

function Roster({ snapshot, course }) {
  if (!snapshot) return <EmptyState title="Todavía no hay una copia sincronizada" body="Sincroniza el curso para consultar sus participantes, calificaciones y actividades." />;
  const students = snapshot.students ?? [];
  if (!students.length) return <EmptyState title="No hay participantes disponibles" body="Moodle no devolvió estudiantes activos para este curso." />;
  return (
    <>
      <div className="section-heading"><div><span className="eyebrow">PARTICIPANTES</span><h3>Estudiantes del curso</h3></div><span className="count-label">{students.length} en total</span></div>
      <div className="table-wrap"><table><thead><tr><th>Estudiante</th><th>Ítems con nota</th><th>Sin nota visible</th><th /></tr></thead><tbody>
        {students.map((student) => {
          const grades = (snapshot.grades ?? []).filter((grade) => String(grade.studentId) === String(student.id) && grade.module === 'assign');
          const graded = grades.filter((grade) => grade.value !== null && grade.value !== undefined).length;
          const unknown = grades.length - graded;
          return <tr key={student.id}><td><div className="student-cell"><span className="student-avatar">{student.name.trim().charAt(0).toUpperCase()}</span><strong>{student.name}</strong></div></td><td><span className="value-label">{graded}</span></td><td><span className="soft-label">{unknown}</span></td><td><Link className="text-button" to={`/courses/${encodeURIComponent(course.id)}/grades/${encodeURIComponent(student.id)}`}>Ver calificaciones <span aria-hidden="true">→</span></Link></td></tr>;
        })}
      </tbody></table></div>
      <p className="table-note">“Sin nota visible” no determina si una actividad fue entregada o está pendiente de calificación.</p>
    </>
  );
}

function StudentGrades({ snapshot, studentId, course }) {
  const navigate = useNavigate();
  if (!snapshot) return <EmptyState title="Sin calificaciones para mostrar" body="Sincroniza el curso para recuperar las notas de Moodle." />;
  const students = snapshot.students ?? [];
  if (!students.length) return <EmptyState title="No hay estudiantes en esta copia" body="Actualiza la sincronización del curso desde Moodle." />;
  const student = students.find((entry) => String(entry.id) === String(studentId)) ?? students[0];
  return (
    <>
      <div className="section-heading grade-heading"><div><span className="eyebrow">DETALLE INDIVIDUAL</span><h3>Calificaciones por actividad</h3></div><label className="select-label">Estudiante<select value={student.id} onChange={(event) => navigate(`/courses/${encodeURIComponent(course.id)}/grades/${encodeURIComponent(event.currentTarget.value)}`)}>{students.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></div>
      <div className="selected-student"><span className="student-avatar student-avatar-large">{student.name.trim().charAt(0).toUpperCase()}</span><div><strong>{student.name}</strong><span>Notas importadas desde Moodle · escala original conservada</span></div></div>
      {[1, 2].map((partial) => <GradeGroup key={partial} snapshot={snapshot} studentId={student.id} partial={partial} />)}
      <p className="table-note">Una nota no disponible se muestra como “Sin nota visible”; no se infiere ausencia de entrega ni pendiente de calificar.</p>
    </>
  );
}

function GradeGroup({ snapshot, studentId, partial }) {
  const rows = (snapshot?.grades ?? []).filter((grade) => String(grade.studentId) === String(studentId) && grade.module === 'assign').map((grade) => {
    const match = String(grade.name).match(/unidad\s*(\d+)\s*(.*)/i);
    const rawActivity = match ? match[2].trim() : String(grade.name);
    const labels = { Examenes: 'Exámenes', Autonomo: 'Aprendizaje autónomo', APEs: 'APEs' };
    return { grade, unit: match ? Number(match[1]) : 99, activity: labels[rawActivity] ?? rawActivity };
  }).filter((item) => (item.unit <= 2 ? 1 : 2) === partial).sort((a, b) => a.unit - b.unit || a.activity.localeCompare(b.activity, 'es'));
  return (
    <section className="grade-group"><div className="grade-group-heading"><span className="partial-number">0{partial}</span><h4>{partial === 1 ? 'Primer parcial' : 'Segundo parcial'}</h4><span className="grade-group-subtitle">Unidades {partial === 1 ? '1 y 2' : '3 y 4'}</span></div>
      <div className="table-wrap"><table className="grades-table"><thead><tr><th>Unidad</th><th>Actividad evaluable</th><th>Calificación</th><th>Escala</th></tr></thead><tbody>{rows.length ? rows.map(({ grade, unit, activity }, index) => <tr key={`${grade.itemId ?? grade.name}-${index}`}><td><span className="unit-tag">Unidad {unit < 99 ? unit : '—'}</span></td><td><strong>{activity || grade.name}</strong></td><td>{grade.value === null || grade.value === undefined ? <span className="soft-label">Sin nota visible</span> : <span className="grade-value">{formatNumber(grade.value)}</span>}</td><td><span className="scale-label">{formatNumber(grade.minimum)} – {formatNumber(grade.maximum)}</span></td></tr>) : <tr><td colSpan="4" className="empty-cell">No hay calificaciones de actividades disponibles para este parcial.</td></tr>}</tbody></table></div>
    </section>
  );
}

function CourseContent({ snapshot }) {
  if (!snapshot) return <EmptyState title="Contenido pendiente de sincronización" body="Sincroniza el curso para recuperar sus unidades y actividades." />;
  const sections = Array.isArray(snapshot.activities) ? snapshot.activities : [];
  if (!sections.length) return <EmptyState title="Moodle no devolvió unidades" body="Comprueba la estructura del curso en Moodle y vuelve a sincronizar." />;
  const visibleSections = sections.filter((section) => Number(section.section ?? section.sectionnum ?? 0) > 0);
  return (
    <>
      <div className="section-heading"><div><span className="eyebrow">ESTRUCTURA DEL CURSO</span><h3>Unidades y actividades evaluables</h3></div><span className="count-label">{visibleSections.length} unidades</span></div>
      <div className="course-sections">{visibleSections.map((section, index) => {
        const unit = Number(section.section ?? section.sectionnum ?? index);
        const modules = (section.modules ?? []).filter((module) => module.name);
        const partial = unit <= 2 ? 'Primer parcial' : 'Segundo parcial';
        const defaultSectionName = /^(new section|section(?:\s+\d+)?)$/i.test(section.name || '');
        const sectionName = defaultSectionName || !section.name ? `Unidad ${unit}` : section.name;
        return <section className="unit-card" key={section.id ?? unit}><div className="unit-card-head"><span className="unit-index">{String(unit).padStart(2, '0')}</span><div><span className="eyebrow">{partial}</span><h4>{sectionName}</h4></div><span className="count-label">{modules.length} {modules.length === 1 ? 'actividad' : 'actividades'}</span></div>
          {modules.length ? <ul className="activity-list">{modules.map((module) => <li key={`${module.id}-${module.name}`}><span className="activity-icon" aria-hidden="true">{module.modname === 'assign' ? '↗' : '▤'}</span><span className="activity-title">{module.name}</span><span className="activity-type">{module.modname === 'assign' ? 'Tarea' : module.modname || 'Actividad'}</span>{module.visible === false && <span className="visibility-tag">Oculta</span>}</li>)}</ul> : <p className="unit-empty">Esta sección todavía no tiene actividades.</p>}
        </section>;
      })}</div>
      <p className="table-note">La estructura se consulta desde Moodle. Esta vista no crea ni modifica cursos, actividades o calificaciones.</p>
    </>
  );
}

function SyncedPage() {
  const { courses, syncByCourse, busy, syncAll, syncCourse } = useDashboard();
  const rows = courses.flatMap((course) => {
    const info = syncByCourse[String(course.id)] ?? { status: 'loading', snapshot: null };
    const snapshot = info.snapshot;
    if (!snapshot) return [{ course, info, student: null, grades: [] }];
    return snapshot.students.map((student) => ({
      course, info, student,
      grades: (snapshot.grades ?? []).filter((grade) => String(grade.studentId) === String(student.id) && grade.module === 'assign'),
    }));
  });
  const anyBusy = courses.some((course) => busy.has(String(course.id)));
  return (
    <section className="data-card synced-card">
      <div className="synced-intro"><div><span className="eyebrow">COPIA AUXILIAR</span><h2>Información sincronizada</h2><p>Revisa el estado de cada curso y abre su contenido o sus calificaciones.</p></div><button className="button button-secondary" onClick={syncAll} disabled={anyBusy}>{anyBusy ? <><span className="spinner spinner-dark" /> Actualizando</> : <><span className="button-icon">↻</span> Sincronizar todos</>}</button></div>
      <div className="table-wrap"><table><thead><tr><th>Curso</th><th>Estudiante</th><th>Notas de actividades</th><th>Última sincronización</th><th>Estado</th><th /></tr></thead><tbody>
        {rows.map(({ course, info, student, grades }, index) => {
          const graded = grades.filter((grade) => grade.value !== null && grade.value !== undefined).length;
          const unknown = grades.length - graded;
          return <tr key={`${course.id}-${student?.id ?? 'empty'}-${index}`}><td><div className="course-name-cell"><span className="course-mini-icon">{course.name.trim().charAt(0).toUpperCase()}</span><strong>{course.name}</strong></div></td><td>{student ? <div className="student-cell"><span className="student-avatar">{student.name.trim().charAt(0).toUpperCase()}</span><strong>{student.name}</strong></div> : <span className="soft-label">Sin participantes todavía</span>}</td><td>{student ? <><span className="value-label">{graded} con nota</span><span className="sync-unknown"> · {unknown} sin nota visible</span></> : <span className="soft-label">Sin datos sincronizados</span>}</td><td>{formatDate(info.snapshot?.syncedAt)}</td><td><StatusPill status={info.status} /></td><td><div className="row-actions">{student ? <Link className="text-button" to={`/courses/${encodeURIComponent(course.id)}/grades/${encodeURIComponent(student.id)}`}>Ver notas</Link> : <button className="text-button" onClick={() => syncCourse(course)} disabled={busy.has(String(course.id))}>Sincronizar</button>}<button className="icon-button" aria-label={`Sincronizar ${course.name}`} onClick={() => syncCourse(course)} disabled={busy.has(String(course.id))}>↻</button></div></td></tr>;
        })}
      </tbody></table></div>
      <div className="source-note"><span className="source-icon">i</span><p>Moodle es la fuente oficial. Esta vista muestra la última copia local disponible y su fecha de actualización.</p></div>
    </section>
  );
}

function GradeRoute() {
  const { courseId } = useParams();
  const { courses, syncByCourse } = useDashboard();
  const course = courses.find((entry) => String(entry.id) === String(courseId));
  if (!course) return <Navigate to={courses.length ? coursePath(courses[0].id) : '/login'} replace />;
  const student = syncByCourse[String(course.id)]?.snapshot?.students?.[0];
  return <Navigate to={student ? `/courses/${encodeURIComponent(course.id)}/grades/${encodeURIComponent(student.id)}` : `/courses/${encodeURIComponent(course.id)}/participants`} replace />;
}

function EmptyState({ title, body }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden="true">⌁</span><h3>{title}</h3><p>{body}</p></div>;
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>;
}

function BrandName() {
  return <span className="brand-name">EduMonitor<span>AI</span></span>;
}

export default App;
