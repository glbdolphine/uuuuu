import { billMonthsOf } from './bills';
import { monthLabel } from './months';
import * as XLSX from 'xlsx';
import { LogEntry } from '../types';

export function exportBatchLogsExcel(logs: LogEntry[]): void {
  const rows = logs.map((l) => ({
    'Connection No': l.logNo,
    'Date': l.date,
    'Institute Name (Customer)': l.customerName,
    'Institute Name (Bangla)': l.nameBn || '',
    'Institute Name (English)': l.nameEn || '',
    'Foreman Name': l.foremanName,
    'Foreman Phone': l.foremanPhone || '',
    'Head Teacher / In-Charge Name': l.headTeacherName || '',
    'Head Teacher / In-Charge Phone': l.headTeacherPhone || '',
    'NMS ID': l.nmsId,
    'EDC Book No': l.edcNo || '',
    'Emis / EIIN / DGHS': l.emisEiinDghs || '',
    'Upazila': l.upazila || '',
    'Union / Ward': l.unionName || '',
    'Latitude': l.lat || '',
    'Longitude': l.long || '',
    'MAC Address': l.mac || '',
    'Router Serial': l.routerSerial || '',
    'Optical Fiber Length (meters)': l.fiberLength || '',
    'Request Type': l.requestType,
    'Status': l.status,
    'Issue Found': l.issueFound || '',
    'Missing/Wrong Details': l.missingWrongDetails || '',
    'Action Taken': l.actionTaken || '',
    'Reason For Action': l.reasonForAction || '',
    'Foreman Informed': l.foremanInformed || '',
    'Follow Up Needed': l.followUpNeeded || '',
    'Follow Up Date': l.followUpDate || '',
    'Supervisor Informed': l.supervisorInformed || '',
    'Remarks': l.remarks || '',
    'Form Received At': l.formReceivedAt || '',
    'Bill Received Months': billMonthsOf(l).map((m) => monthLabel(m)).join(', '),
    'Created At': l.createdAt || '',
    'Created By': l.createdBy || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Pace IT Connections');
  XLSX.writeFile(workbook, `Pace_IT_Records_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportSingleLogExcel(log: LogEntry): void {
  const data = [
    { Field: 'Connection No.', Value: `#${log.logNo}` },
    { Field: 'Date', Value: log.date },
    { Field: 'Institute Name (Customer)', Value: log.customerName },
    { Field: 'Foreman Name', Value: log.foremanName },
    { Field: 'Foreman Phone', Value: log.foremanPhone || '' },
    { Field: 'Head Teacher / In-Charge Name', Value: log.headTeacherName || '' },
    { Field: 'Head Teacher Phone', Value: log.headTeacherPhone || '' },
    { Field: 'Upazila / City Corporation', Value: log.upazila || '' },
    { Field: 'Union / Ward', Value: log.unionName || '' },
    { Field: 'Coordinates (Lat, Long)', Value: [log.lat, log.long].filter(Boolean).join(', ') },
    { Field: 'NMS ID', Value: log.nmsId },
    { Field: 'EDC Book No.', Value: log.edcNo || '' },
    { Field: 'Emis / EIIN / DGHS', Value: log.emisEiinDghs || '' },
    { Field: 'Router Serial No.', Value: log.routerSerial || '' },
    { Field: 'MAC Address', Value: log.mac || '' },
    { Field: 'Optical Fiber Cable Length (meters)', Value: log.fiberLength || '' },
    { Field: 'Request Type', Value: log.requestType },
    { Field: 'Status', Value: log.status },
    { Field: 'Issue Found', Value: log.issueFound || '' },
    { Field: 'Missing / Wrong Details', Value: log.missingWrongDetails || '' },
    { Field: 'Action Taken', Value: log.actionTaken || '' },
    { Field: 'Reason For Action', Value: log.reasonForAction || '' },
    { Field: 'Foreman Informed', Value: log.foremanInformed || '' },
    { Field: 'Follow-up Needed', Value: log.followUpNeeded || '' },
    { Field: 'Follow-up Date', Value: log.followUpDate || '' },
    { Field: 'Supervisor Informed', Value: log.supervisorInformed || '' },
    { Field: 'Remarks', Value: log.remarks || '' },
    { Field: 'Form Received At', Value: log.formReceivedAt || '' },
    { Field: 'Bill Received Months', Value: billMonthsOf(log).map((m) => monthLabel(m)).join(', ') },
    { Field: 'Created At', Value: log.createdAt || '' },
    { Field: 'Created By', Value: log.createdBy || '' },
  ];

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Log_${log.logNo}`);
  XLSX.writeFile(workbook, `Pace_IT_Connection_${log.logNo}.xlsx`);
}
