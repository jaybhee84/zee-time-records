export const TEACHING_SUBGROUPS = [
  "Kinder",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "SNED",
  "Departmental",
  "Subject Teacher",
  "Alive",
  "Substitute Teacher",
];

export const NON_TEACHING_SUBGROUPS = ["Admin", "Job Order"];

const normalize = (value = "") => String(value).trim().toLowerCase();

export const isTeachingSubgroup = (subGroup = "") => {
  const normalized = normalize(subGroup);
  return (
    TEACHING_SUBGROUPS.some((item) => normalize(item) === normalized) ||
    normalized === "sped" ||
    normalized.startsWith("subject teacher") ||
    normalized.startsWith("substitute teacher")
  );
};

export const isNonTeachingSubgroup = (subGroup = "") =>
  NON_TEACHING_SUBGROUPS.some(
    (item) => normalize(item) === normalize(subGroup),
  ) || !isTeachingSubgroup(subGroup);

export const importedGroupValue = (groupName) =>
  `imported:${String(groupName || "").trim()}`;

export const isImportedGroupValue = (value = "") =>
  String(value).startsWith("imported:");

export const getImportedGroupName = (value = "") =>
  isImportedGroupValue(value) ? String(value).slice("imported:".length) : "";

export function getGroupOptions(employees = []) {
  const options = [
    { value: "teaching", label: "Teaching" },
    { value: "non-teaching", label: "Non-Teaching" },
  ];
  const seen = new Set(options.map((option) => normalize(option.label)));

  for (const employee of Array.isArray(employees) ? employees : []) {
    const groupName = String(employee?.sourceGroup || "").trim();
    const key = normalize(groupName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    options.push({ value: importedGroupValue(groupName), label: groupName });
  }

  return options;
}

export function employeeMatchesGroup(employee, value) {
  if (!value || value === "all") return true;
  if (value === "teaching") return isTeachingSubgroup(employee?.subGroup);
  if (value === "non-teaching")
    return isNonTeachingSubgroup(employee?.subGroup);

  const importedName = getImportedGroupName(value);
  return Boolean(
    importedName &&
      normalize(employee?.sourceGroup) === normalize(importedName),
  );
}

export function subgroupMatches(employeeSubgroup = "", selected = "") {
  const employeeValue = normalize(employeeSubgroup);
  const selectedValue = normalize(selected);

  if (
    (selectedValue === "sned" || selectedValue === "sped") &&
    (employeeValue === "sned" || employeeValue === "sped")
  ) {
    return true;
  }
  if (
    selectedValue.startsWith("subject teacher") &&
    employeeValue.startsWith("subject teacher")
  ) {
    return true;
  }
  if (
    selectedValue.startsWith("substitute teacher") &&
    employeeValue.startsWith("substitute teacher")
  ) {
    return true;
  }
  return employeeValue === selectedValue;
}
