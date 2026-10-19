import { LogEntry, LogFieldKey, FieldSuggestionsMap } from '../types';

export const INITIAL_SUGGESTIONS: FieldSuggestionsMap = {
  foremanName: ['Shabul- Balaganj','Rahman- Sylhet Sadar','Kabir- Beanibazar','Alam- Golapganj','Faruk- Biswanath'],
  foremanPhone: ['+880 1680-945894','+880 1711-234567','+880 1912-345678'],
  requestType: ['New User ID','Form Submission','Bandwidth Upgrade','Router Relocation','Profile Modification','MAC Binding Reset','IP Address Re-assignment'],
  customerName: ['Hasampur Govt. Primary School','Radhakona Govt. Primary School','Sreemangal Model High School','Balaganj Technical Institute'],
  nmsId: [],
  issueFound: ['Same router at two institute','MAC address collision in NMS','Incorrect package assigned','Port link down on OLT','VLAN mismatch at foreman switch'],
  missingWrongDetails: ['They previously used the same router in Radhakona Govt. Primary School','National ID card copy missing from form','Phone number mismatch on application form','Previous billing clearance pending'],
  actionTaken: ['Provided the id/form as requested but kept nms entry on hold','Created user ID in NMS and notified foreman via WhatsApp','Updated MAC binding in authentication server','Forwarded ticket to Core NOC team for IP remapping'],
  reasonForAction: ["I did not entry this school in nms because nms doesn't allow two school with same router.",'Awaiting confirmation of router decommissioning from previous site.','Verified payment voucher with accounts before activating profile.'],
  foremanInformed: ['Yes - phone','Yes - WhatsApp','Yes - email','Yes - in-person','No - unanswered phone call','No - SMS sent'],
  followUpNeeded: ['Yes','No','Pending foreman callback','Pending supervisor review'],
  status: ['Pending - waiting for foreman','In Progress','Resolved','Escalated to Core Team','On Hold','Closed'],
  supervisorInformed: ['I informed my superiors','Approved by Team Lead','Informed Operations Manager','Escalated to Duty Manager','No approval needed (standard request)'],
  remarks: ['Foreman said Radhakona Govt. Primary School is not using the network or the router anymore. So they decided to use it for another school.','Foreman promised to submit the formal decommissioning request by tomorrow.','Client requested urgent activation before morning classes.'],
  mac: ['20:23:51:78:49:F4','44:D9:E7:2B:1A:08','E4:5F:01:8C:3D:A2'],
};

export interface AppBackupData {
  version: number;
  appName: string;
  exportedAt: string;
  logs: LogEntry[];
  suggestions: FieldSuggestionsMap;
}

export function exportAppBackup(logs: LogEntry[], suggestions: FieldSuggestionsMap): void {
  const backupData: AppBackupData = {
    version: 2,
    appName: 'Pace IT',
    exportedAt: new Date().toISOString(),
    logs,
    suggestions,
  };
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `PaceIT_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function parseAppBackup(jsonString: string): { logs: LogEntry[]; suggestions: FieldSuggestionsMap } {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err: any) {
    throw new Error(`Invalid JSON format: ${err.message}`);
  }

  if (!parsed || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
    throw new Error('Invalid backup file format. Expected a JSON object or array.');
  }

  let rawLogsList: any[] = [];
  let suggestionsMap: FieldSuggestionsMap = INITIAL_SUGGESTIONS;

  if (Array.isArray(parsed)) {
    rawLogsList = parsed;
  } else if (Array.isArray(parsed.logs)) {
    rawLogsList = parsed.logs;
    if (parsed.suggestions && typeof parsed.suggestions === 'object') {
      suggestionsMap = { ...INITIAL_SUGGESTIONS, ...parsed.suggestions };
    }
  } else if (Array.isArray(parsed.data)) {
    rawLogsList = parsed.data;
  } else if (Array.isArray(parsed.rows)) {
    rawLogsList = parsed.rows;
  }

  const logs: LogEntry[] = rawLogsList.map((item: any, idx: number) => {
    // If Supabase exported row with a JSON `data` column
    const data = (item && typeof item.data === 'object' && item.data !== null) ? item.data : item;

    return {
      id: String(data.id || item.id || `imported-${idx + 1}`),
      logNo: data.logNo ?? data.log_no ?? item.log_no ?? idx + 1,
      date: String(data.date || item.date || ''),
      foremanName: String(data.foremanName || data.foreman_name || item.foreman_name || ''),
      foremanPhone: String(data.foremanPhone || data.foreman_phone || data.callerPhone || data.caller_phone || item.foreman_phone || item.caller_phone || ''),
      requestType: String(data.requestType || data.request_type || item.request_type || ''),
      customerName: String(data.customerName || data.customer_name || item.customer_name || ''),
      nmsId: String(data.nmsId || data.nms_id || item.nms_id || ''),
      issueFound: String(data.issueFound || data.issue_found || item.issue_found || ''),
      missingWrongDetails: String(data.missingWrongDetails || data.missing_wrong_details || item.missing_wrong_details || ''),
      actionTaken: String(data.actionTaken || data.action_taken || item.action_taken || ''),
      reasonForAction: String(data.reasonForAction || data.reason_for_action || item.reason_for_action || ''),
      foremanInformed: String(data.foremanInformed || data.foreman_informed || item.foreman_informed || ''),
      followUpNeeded: String(data.followUpNeeded || data.follow_up_needed || item.follow_up_needed || ''),
      status: String(data.status || item.status || 'Resolved'),
      supervisorInformed: String(data.supervisorInformed || data.supervisor_informed || item.supervisor_informed || ''),
      remarks: String(data.remarks || item.remarks || ''),
      mac: String(data.mac || item.mac || ''),
      edcNo: data.edcNo ?? data.edc_no ?? item.edc_no,
      emisEiinDghs: data.emisEiinDghs ?? data.emis_eiin_dghs ?? item.emis_eiin_dghs,
      routerSerial: data.routerSerial ?? data.router_serial ?? item.router_serial,
      formReceivedAt: data.formReceivedAt ?? data.form_received_at ?? item.form_received_at,
      foremanId: data.foremanId ?? data.foreman_id ?? item.foreman_id,
      followUpDate: data.followUpDate ?? data.follow_up_date ?? item.follow_up_date,
      createdAt: String(data.createdAt || data.created_at || item.created_at || new Date().toISOString()),
      updatedAt: String(data.updatedAt || data.updated_at || item.updated_at || new Date().toISOString()),
      createdBy: data.createdBy || data.created_by || item.created_by_name || 'Imported',
      updatedBy: data.updatedBy || data.updated_by || item.updated_by_name || 'Imported',
      history: Array.isArray(data.history) ? data.history : [],
    };
  });

  return { logs, suggestions: suggestionsMap };
}
