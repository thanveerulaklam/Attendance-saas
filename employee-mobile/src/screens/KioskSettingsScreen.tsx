import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  createKioskEmployee,
  enrollKioskEmployeeFace,
  fetchKioskAttendanceLogs,
  fetchKioskEmployees,
  fetchKioskPreferences,
  removeKioskEmployeeFace,
  updateKioskPreferences,
  type KioskAttendanceLog,
  type KioskEmployee,
  type KioskPreferences,
} from '../api/kiosk';
import { useKiosk } from '../context/KioskContext';
import { colors } from '../theme';

type Section = 'employees' | 'logs' | 'preferences';
type Range = 'week' | 'month' | 'custom';

const DUPLICATE_PRESETS = [
  { label: '30 sec', seconds: 30 },
  { label: '1 min', seconds: 60 },
  { label: '90 sec', seconds: 90 },
  { label: '2 min', seconds: 120 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
];

const MIN_RECOGNIZE_PRESETS = [
  { label: 'Off', seconds: 0 },
  { label: '1 sec', seconds: 1 },
  { label: '2 sec', seconds: 2 },
  { label: '3 sec', seconds: 3 },
  { label: '5 sec', seconds: 5 },
];

function dateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function rangeDates(range: Range, customFrom: string, customTo: string) {
  const now = new Date();
  if (range === 'custom') {
    return {
      from: new Date(`${customFrom}T00:00:00`).toISOString(),
      to: new Date(`${customTo}T23:59:59`).toISOString(),
    };
  }
  const from = new Date(now);
  if (range === 'week') {
    from.setDate(from.getDate() - 6);
  } else {
    from.setDate(1);
  }
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: now.toISOString() };
}

export default function KioskSettingsScreen() {
  const { session, refresh, signOut } = useKiosk();
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [section, setSection] = useState<Section>('employees');
  const [employees, setEmployees] = useState<KioskEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<KioskEmployee | null>(null);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newSalary, setNewSalary] = useState('');
  const [salaryType, setSalaryType] = useState<'monthly' | 'per_day'>('monthly');
  const [newJoinDate, setNewJoinDate] = useState(() => dateInput(new Date()));
  const [addBusy, setAddBusy] = useState(false);
  const codeEdited = useRef(false);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [range, setRange] = useState<Range>('week');
  const [customFrom, setCustomFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return dateInput(date);
  });
  const [customTo, setCustomTo] = useState(() => dateInput(new Date()));
  const [logs, setLogs] = useState<KioskAttendanceLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [preferences, setPreferences] = useState<KioskPreferences | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [duplicateSecondsInput, setDuplicateSecondsInput] = useState('90');
  const [minRecognizeInput, setMinRecognizeInput] = useState('2');

  const loadEmployees = useCallback(async () => {
    try {
      setEmployeesLoading(true);
      const data = await fetchKioskEmployees();
      setEmployees(data.items);
      if (!codeEdited.current) setNewCode(data.suggestedEmployeeCode);
    } catch (err) {
      setMessage((err as Error).message || 'Could not load employees');
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const loadLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      setMessage(null);
      const dates = rangeDates(range, customFrom, customTo);
      const data = await fetchKioskAttendanceLogs({
        dateFrom: dates.from,
        dateTo: dates.to,
      });
      setLogs(data.items);
    } catch (err) {
      setMessage((err as Error).message || 'Could not load attendance logs');
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [range, customFrom, customTo]);

  useEffect(() => {
    if (section === 'logs') loadLogs();
  }, [section, loadLogs]);

  const loadPreferences = useCallback(async () => {
    try {
      setPreferencesLoading(true);
      setMessage(null);
      const data = await fetchKioskPreferences();
      setPreferences(data);
      setDuplicateSecondsInput(String(data.duplicate_punch_seconds));
      setMinRecognizeInput(String(data.min_recognize_seconds ?? 2));
    } catch (err) {
      setMessage((err as Error).message || 'Could not load preferences');
    } finally {
      setPreferencesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section === 'preferences') loadPreferences();
  }, [section, loadPreferences]);

  const savePreferences = async (payload: {
    duplicatePunchSeconds?: number;
    minRecognizeSeconds?: number;
  }) => {
    try {
      setPreferencesBusy(true);
      setMessage(null);
      const data = await updateKioskPreferences(payload);
      setPreferences(data);
      setDuplicateSecondsInput(String(data.duplicate_punch_seconds));
      setMinRecognizeInput(String(data.min_recognize_seconds));
      await refresh();
      if (payload.minRecognizeSeconds != null) {
        setMessage(
          data.min_recognize_seconds === 0
            ? 'Minimum hold time turned off.'
            : `Face must be held for ${data.min_recognize_seconds} seconds before punch.`
        );
      } else {
        setMessage(
          `Duplicate recognition wait set to ${data.duplicate_punch_seconds} seconds.`
        );
      }
    } catch (err) {
      setMessage((err as Error).message || 'Could not save preferences');
    } finally {
      setPreferencesBusy(false);
    }
  };

  const groupedLogs = useMemo(() => {
    const groups = new Map<
      number,
      { employeeName: string; employeeCode: string; items: KioskAttendanceLog[] }
    >();
    logs.forEach((log) => {
      const existing = groups.get(log.employee_id) || {
        employeeName: log.employee_name,
        employeeCode: log.employee_code,
        items: [],
      };
      existing.items.push(log);
      groups.set(log.employee_id, existing);
    });
    return Array.from(groups.values());
  }, [logs]);

  const addEmployee = async () => {
    if (addBusy) return;
    const name = newName.trim();
    const employeeCode = newCode.trim();
    const salary = Number(newSalary);
    if (name.length < 2) {
      setMessage('Name must be at least 2 characters.');
      return;
    }
    if (!employeeCode) {
      setMessage('Employee code is required.');
      return;
    }
    if (!Number.isFinite(salary) || salary <= 0) {
      setMessage('Basic salary must be a positive number.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newJoinDate.trim())) {
      setMessage('Join date must be YYYY-MM-DD.');
      return;
    }
    try {
      setAddBusy(true);
      setMessage(null);
      const created = await createKioskEmployee({
        name,
        employeeCode,
        basicSalary: salary,
        joinDate: newJoinDate.trim(),
        salaryType,
      });
      setNewName('');
      setNewSalary('');
      setSalaryType('monthly');
      setNewJoinDate(dateInput(new Date()));
      codeEdited.current = false;
      const data = await fetchKioskEmployees();
      setEmployees(data.items);
      setNewCode(data.suggestedEmployeeCode);
      await refresh();
      setSelectedEmployee({
        id: created.data.id,
        name: created.data.name,
        employee_code: created.data.employee_code,
        status: created.data.status || 'active',
        face_enrollment_id: null,
      });
    } catch (err) {
      setMessage((err as Error).message || 'Could not add employee');
    } finally {
      setAddBusy(false);
    }
  };

  const captureEnrollment = async () => {
    if (!selectedEmployee || !cameraRef.current || enrollBusy) return;
    try {
      setEnrollBusy(true);
      setMessage('Checking face…');
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.65,
        skipProcessing: false,
      });
      if (!photo?.base64) throw new Error('Could not capture photo');
      await enrollKioskEmployeeFace(selectedEmployee.id, photo.base64);
      setSelectedEmployee(null);
      setMessage(`Face saved for ${selectedEmployee.name}`);
      await Promise.all([loadEmployees(), refresh()]);
    } catch (err) {
      setMessage((err as Error).message || 'Face enrollment failed');
    } finally {
      setEnrollBusy(false);
    }
  };

  const removeFace = async (employee: KioskEmployee) => {
    try {
      setMessage(null);
      await removeKioskEmployeeFace(employee.id);
      setMessage(`Face removed for ${employee.name}`);
      await Promise.all([loadEmployees(), refresh()]);
    } catch (err) {
      setMessage((err as Error).message || 'Could not remove face');
    }
  };

  if (selectedEmployee) {
    if (!cameraPermission) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    }
    if (!cameraPermission.granted) {
      return (
        <View style={styles.center}>
          <Text style={styles.help}>Camera permission is required to enroll a face.</Text>
          <Pressable style={styles.primaryButton} onPress={requestCameraPermission}>
            <Text style={styles.primaryButtonText}>Allow camera</Text>
          </Pressable>
          <Pressable onPress={() => setSelectedEmployee(null)}>
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
        <View style={styles.cameraHeader}>
          <Text style={styles.cameraTitle}>Enroll {selectedEmployee.name}</Text>
          <Text style={styles.cameraSub}>Employee code: {selectedEmployee.employee_code}</Text>
          <Text style={styles.cameraSub}>Face forward · remove glasses · use good light</Text>
        </View>
        <View style={styles.cameraFooter}>
          {enrollBusy && <ActivityIndicator color="#fff" />}
          <Pressable
            style={styles.captureButton}
            disabled={enrollBusy}
            onPress={captureEnrollment}
          >
            <Text style={styles.captureButtonText}>
              {enrollBusy ? 'Processing…' : 'Take enrollment photo'}
            </Text>
          </Pressable>
          <Pressable disabled={enrollBusy} onPress={() => setSelectedEmployee(null)}>
            <Text style={styles.cameraCancel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          {session?.company.name} · {session?.branch.name}
        </Text>
      </View>

      <View style={styles.segment}>
        {(
          [
            ['employees', 'Employees'],
            ['logs', 'Logs'],
            ['preferences', 'Preferences'],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            style={[styles.segmentButton, section === id && styles.segmentActive]}
            onPress={() => setSection(id)}
          >
            <Text style={section === id ? styles.segmentTextActive : styles.segmentText}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {section === 'employees' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Add employee</Text>
            <Text style={styles.help}>
              Creates the employee for this branch. The next screen takes their face photo so they
              can punch here. Pay details can be updated later in PunchPay.
            </Text>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.field}
              value={newName}
              onChangeText={setNewName}
              placeholder="Employee name"
              editable={!addBusy}
            />
            <Text style={styles.fieldLabel}>Employee code</Text>
            <TextInput
              style={styles.field}
              value={newCode}
              onChangeText={(value) => {
                codeEdited.current = true;
                setNewCode(value);
              }}
              autoCapitalize="characters"
              placeholder="e.g. 18 or EMP-015"
              editable={!addBusy}
            />
            <Text style={styles.fieldLabel}>
              {salaryType === 'per_day' ? 'Daily basic salary' : 'Monthly basic salary'}
            </Text>
            <TextInput
              style={styles.field}
              value={newSalary}
              onChangeText={setNewSalary}
              keyboardType="decimal-pad"
              placeholder="e.g. 15000"
              editable={!addBusy}
            />
            <View style={styles.presetGrid}>
              {(
                [
                  ['monthly', 'Monthly'],
                  ['per_day', 'Per day'],
                ] as const
              ).map(([value, label]) => (
                <Pressable
                  key={value}
                  disabled={addBusy}
                  style={[styles.presetButton, salaryType === value && styles.presetButtonActive]}
                  onPress={() => setSalaryType(value)}
                >
                  <Text style={salaryType === value ? styles.presetTextActive : styles.presetText}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Join date</Text>
            <TextInput
              style={styles.field}
              value={newJoinDate}
              onChangeText={setNewJoinDate}
              placeholder="YYYY-MM-DD"
              editable={!addBusy}
            />
            <Pressable
              style={[styles.addButton, addBusy && styles.addButtonDisabled]}
              disabled={addBusy}
              onPress={addEmployee}
            >
              <Text style={styles.primaryButtonText}>
                {addBusy ? 'Adding…' : 'Add employee'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>
            Employees ({employees.length}) · Faces enrolled (
            {employees.filter((item) => item.face_enrollment_id).length})
          </Text>

          {employeesLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            employees.map((employee) => {
              const photoUri = employee.photo_base64
                ? `data:${employee.photo_mime || 'image/jpeg'};base64,${employee.photo_base64}`
                : null;
              return (
                <View key={employee.id} style={styles.employeeRow}>
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarEmpty]}>
                      <Text style={styles.avatarText}>
                        {employee.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.employeeInfo}>
                    <Text style={styles.employeeName}>{employee.name}</Text>
                    <Text style={styles.employeeCode}>{employee.employee_code}</Text>
                    <Text
                      style={
                        employee.face_enrollment_id ? styles.enrolled : styles.notEnrolled
                      }
                    >
                      {employee.face_enrollment_id ? 'Face enrolled' : 'Not enrolled'}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Pressable onPress={() => setSelectedEmployee(employee)}>
                      <Text style={styles.actionLink}>
                        {employee.face_enrollment_id ? 'Retake' : 'Add face'}
                      </Text>
                    </Pressable>
                    {employee.face_enrollment_id ? (
                      <Pressable onPress={() => removeFace(employee)}>
                        <Text style={styles.removeLink}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}

          <Pressable style={styles.changeKioskButton} onPress={signOut}>
            <Text style={styles.changeKioskText}>Change kiosk / branch</Text>
          </Pressable>
        </ScrollView>
      ) : section === 'logs' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.rangeRow}>
            {(['week', 'month', 'custom'] as Range[]).map((item) => (
              <Pressable
                key={item}
                style={[styles.rangeButton, range === item && styles.rangeActive]}
                onPress={() => setRange(item)}
              >
                <Text style={range === item ? styles.rangeTextActive : styles.rangeText}>
                  {item === 'week' ? 'Weekly' : item === 'month' ? 'Monthly' : 'Custom'}
                </Text>
              </Pressable>
            ))}
          </View>

          {range === 'custom' ? (
            <View style={styles.customDates}>
              <TextInput
                style={styles.dateInput}
                value={customFrom}
                onChangeText={setCustomFrom}
                placeholder="YYYY-MM-DD"
              />
              <Text style={styles.help}>to</Text>
              <TextInput
                style={styles.dateInput}
                value={customTo}
                onChangeText={setCustomTo}
                placeholder="YYYY-MM-DD"
              />
              <Pressable style={styles.primaryButton} onPress={loadLogs}>
                <Text style={styles.primaryButtonText}>Apply</Text>
              </Pressable>
            </View>
          ) : null}

          {logsLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : groupedLogs.length === 0 ? (
            <Text style={styles.empty}>No kiosk attendance in this period.</Text>
          ) : (
            groupedLogs.map((group) => (
              <View key={group.employeeCode} style={styles.logCard}>
                <Text style={styles.employeeName}>{group.employeeName}</Text>
                <Text style={styles.employeeCode}>{group.employeeCode}</Text>
                {group.items.map((log) => (
                  <View key={log.id} style={styles.logRow}>
                    <Text style={styles.logDate}>
                      {new Date(log.punch_time).toLocaleDateString()}
                    </Text>
                    <Text style={styles.logTime}>
                      {new Date(log.punch_time).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    <Text
                      style={[
                        styles.punchBadge,
                        log.punch_type === 'in' ? styles.punchIn : styles.punchOut,
                      ]}
                    >
                      {log.punch_type.toUpperCase()}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Duplicate recognition wait</Text>
            <Text style={styles.help}>
              After an employee punches, ignore the same face for this many seconds. Increase this if
              one person is getting multiple punches too quickly.
            </Text>

            {preferencesLoading ? (
              <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} />
            ) : (
              <>
                <Text style={styles.currentValue}>
                  Current: {preferences?.duplicate_punch_seconds ?? 90} seconds
                </Text>
                <View style={styles.presetGrid}>
                  {DUPLICATE_PRESETS.map((preset) => {
                    const active =
                      Number(preferences?.duplicate_punch_seconds) === preset.seconds;
                    return (
                      <Pressable
                        key={preset.seconds}
                        style={[
                          styles.presetButton,
                          active && styles.presetButtonActive,
                        ]}
                        disabled={preferencesBusy}
                        onPress={() => savePreferences({ duplicatePunchSeconds: preset.seconds })}
                      >
                        <Text
                          style={
                            active ? styles.presetTextActive : styles.presetText
                          }
                        >
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.help, { marginTop: 14 }]}>
                  Or enter a custom value (
                  {preferences?.min_duplicate_punch_seconds ?? 15}–
                  {preferences?.max_duplicate_punch_seconds ?? 600} seconds)
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={duplicateSecondsInput}
                    onChangeText={(value) =>
                      setDuplicateSecondsInput(value.replace(/\D/g, '').slice(0, 3))
                    }
                    keyboardType="number-pad"
                    placeholder="90"
                  />
                  <Pressable
                    style={styles.primaryButton}
                    disabled={preferencesBusy}
                    onPress={() => {
                      const seconds = Number(duplicateSecondsInput);
                      if (!Number.isFinite(seconds) || seconds <= 0) {
                        setMessage('Enter a valid number of seconds.');
                        return;
                      }
                      savePreferences({ duplicatePunchSeconds: seconds });
                    }}
                  >
                    <Text style={styles.primaryButtonText}>
                      {preferencesBusy ? 'Saving…' : 'Save'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Minimum face hold time</Text>
            <Text style={styles.help}>
              The same face must stay in front of the camera for this long before attendance is
              marked. Helps avoid accidental punches from a quick glance.
            </Text>

            {preferencesLoading ? (
              <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} />
            ) : (
              <>
                <Text style={styles.currentValue}>
                  Current:{' '}
                  {Number(preferences?.min_recognize_seconds ?? 2) === 0
                    ? 'Off'
                    : `${preferences?.min_recognize_seconds ?? 2} seconds`}
                </Text>
                <View style={styles.presetGrid}>
                  {MIN_RECOGNIZE_PRESETS.map((preset) => {
                    const active =
                      Number(preferences?.min_recognize_seconds ?? 2) === preset.seconds;
                    return (
                      <Pressable
                        key={preset.seconds}
                        style={[
                          styles.presetButton,
                          active && styles.presetButtonActive,
                        ]}
                        disabled={preferencesBusy}
                        onPress={() =>
                          savePreferences({ minRecognizeSeconds: preset.seconds })
                        }
                      >
                        <Text
                          style={
                            active ? styles.presetTextActive : styles.presetText
                          }
                        >
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.help, { marginTop: 14 }]}>
                  Or enter a custom value (
                  {preferences?.min_min_recognize_seconds ?? 0}–
                  {preferences?.max_min_recognize_seconds ?? 10} seconds)
                </Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={minRecognizeInput}
                    onChangeText={(value) =>
                      setMinRecognizeInput(value.replace(/\D/g, '').slice(0, 2))
                    }
                    keyboardType="number-pad"
                    placeholder="2"
                  />
                  <Pressable
                    style={styles.primaryButton}
                    disabled={preferencesBusy}
                    onPress={() => {
                      const seconds = Number(minRecognizeInput);
                      if (!Number.isFinite(seconds) || seconds < 0) {
                        setMessage('Enter a valid hold time in seconds.');
                        return;
                      }
                      savePreferences({ minRecognizeSeconds: seconds });
                    }}
                  >
                    <Text style={styles.primaryButtonText}>
                      {preferencesBusy ? 'Saving…' : 'Save'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: colors.bg,
  },
  header: { paddingTop: 52, paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { marginTop: 2, fontSize: 13, color: colors.muted },
  segment: {
    marginHorizontal: 20,
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    backgroundColor: '#e2e8f0',
  },
  segmentButton: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  segmentTextActive: { color: colors.text, fontSize: 12, fontWeight: '700' },
  message: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    color: '#92400e',
    backgroundColor: '#fef3c7',
    fontSize: 12,
  },
  content: { padding: 20, paddingBottom: 100, gap: 12 },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  help: { marginTop: 3, fontSize: 12, color: colors.muted, lineHeight: 17 },
  currentValue: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  presetGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetButton: {
    minWidth: '30%',
    flexGrow: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  presetButtonActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  presetText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  presetTextActive: { color: '#0A0A0A', fontSize: 12, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  field: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: colors.text,
  },
  addButton: {
    marginTop: 14,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  addButtonDisabled: { opacity: 0.6 },
  primaryButton: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.primary,
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  link: { color: colors.primary, fontWeight: '600' },
  sectionTitle: { marginTop: 6, fontSize: 13, fontWeight: '700', color: colors.text },
  employeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarEmpty: { backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primaryDark, fontSize: 20, fontWeight: '700' },
  employeeInfo: { flex: 1 },
  employeeName: { fontSize: 14, fontWeight: '700', color: colors.text },
  employeeCode: { marginTop: 1, fontSize: 11, color: colors.muted },
  enrolled: { marginTop: 3, fontSize: 10, color: colors.success, fontWeight: '600' },
  notEnrolled: { marginTop: 3, fontSize: 10, color: '#b45309', fontWeight: '600' },
  rowActions: { alignItems: 'flex-end', gap: 8 },
  actionLink: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  removeLink: { color: colors.danger, fontSize: 11 },
  changeKioskButton: { alignItems: 'center', paddingVertical: 16 },
  changeKioskText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  rangeRow: { flexDirection: 'row', gap: 8 },
  rangeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  rangeActive: { backgroundColor: colors.primary },
  rangeText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  rangeTextActive: { color: '#fff', fontSize: 12, fontWeight: '700' },
  customDates: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  dateInput: {
    minWidth: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#fff',
  },
  empty: { paddingVertical: 40, textAlign: 'center', color: colors.muted },
  logCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  logDate: { flex: 1, fontSize: 12, color: colors.text },
  logTime: { fontSize: 12, color: colors.muted },
  punchBadge: {
    minWidth: 38,
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: 5,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: '700',
  },
  punchIn: { color: '#065f46', backgroundColor: '#d1fae5' },
  punchOut: { color: '#9f1239', backgroundColor: '#ffe4e6' },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  cameraHeader: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.78)',
  },
  cameraTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cameraSub: { marginTop: 3, color: '#cbd5e1', fontSize: 12 },
  cameraFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 12,
    padding: 24,
    paddingBottom: 42,
    backgroundColor: 'rgba(15,23,42,0.88)',
  },
  captureButton: {
    minWidth: 230,
    alignItems: 'center',
    borderRadius: 999,
    padding: 14,
    backgroundColor: colors.primary,
  },
  captureButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cameraCancel: { color: '#cbd5e1', fontSize: 13 },
});
