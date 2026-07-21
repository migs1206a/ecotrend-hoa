import json
import math
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

ML_ENABLED = str(os.environ.get("AI_ANALYTICS_ENABLE_ML", "false")).strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
ML_IMPORT_ERROR = None


def load_ml_dependencies():
    global ML_IMPORT_ERROR

    if not ML_ENABLED:
        return None, None

    try:
        import numpy as np
        from sklearn.ensemble import IsolationForest

        return np, IsolationForest
    except Exception as error:
        ML_IMPORT_ERROR = str(error)
        return None, None


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def parse_datetime(value):
    if not value:
        return None

    text = str(value).strip()
    if not text:
        return None

    if text.endswith("Z"):
        text = text[:-1] + "+00:00"

    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def ensure_timezone(value):
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value


def to_iso(value):
    if not value:
        return None

    return ensure_timezone(value).isoformat()


def safe_label(value, fallback="Unknown"):
    text = str(value or "").strip()
    return text if text else fallback


def format_hour_label(hour_value):
    suffix = "AM" if hour_value < 12 else "PM"
    normalized_hour = hour_value % 12 or 12
    return f"{normalized_hour}:00 {suffix}"


def format_day_label(value):
    return ensure_timezone(value).strftime("%b %d")


def severity_for_ratio(value, medium_threshold, high_threshold, critical_threshold):
    if value >= critical_threshold:
        return "critical"
    if value >= high_threshold:
        return "high"
    if value >= medium_threshold:
        return "medium"
    return "low"


def severity_for_count(value, medium_threshold, high_threshold, critical_threshold):
    if value >= critical_threshold:
        return "critical"
    if value >= high_threshold:
        return "high"
    if value >= medium_threshold:
        return "medium"
    return "low"


def round_number(value, digits=1):
    return round(float(value or 0), digits)


def average(values):
    cleaned = [float(value) for value in values if value is not None]
    if not cleaned:
        return 0.0
    return sum(cleaned) / len(cleaned)


def count_breakdown(values):
    counter = Counter(value for value in values if value)
    return [
        {"label": label, "count": count}
        for label, count in counter.most_common()
    ]


def purpose_breakdown(visitors, limit=5):
    counter = Counter()

    for visitor in visitors:
        purpose = safe_label(visitor.get("purpose"), "General Visit")
        counter[purpose] += 1

    return [
        {"label": label, "count": count}
        for label, count in counter.most_common(limit)
    ]


def build_hourly_activity(entry_logs, visitors, deliveries):
    hourly_counts = Counter()

    for entry_log in entry_logs:
        timestamp = parse_datetime(entry_log.get("timestamp"))
        if timestamp:
            hourly_counts[timestamp.hour] += 1

    for visitor in visitors:
        timestamp = parse_datetime(visitor.get("entryTime") or visitor.get("expectedDate") or visitor.get("createdAt"))
        if timestamp:
            hourly_counts[timestamp.hour] += 1

    for delivery in deliveries:
        timestamp = parse_datetime(delivery.get("entryTime") or delivery.get("createdAt"))
        if timestamp:
            hourly_counts[timestamp.hour] += 1

    return [
        {
            "hour": hour,
            "label": format_hour_label(hour),
            "count": hourly_counts.get(hour, 0)
        }
        for hour in range(24)
    ]


def build_daily_activity(window_start, now, entry_logs, visitors, deliveries, complaints, reservations):
    total_days = max(1, min((now - window_start).days + 1, 14))
    first_day = now - timedelta(days=total_days - 1)
    buckets = {}

    for day_index in range(total_days):
        current_day = (first_day + timedelta(days=day_index)).date()
        buckets[current_day] = {
            "date": current_day.isoformat(),
            "label": format_day_label(datetime.combine(current_day, datetime.min.time(), tzinfo=timezone.utc)),
            "total": 0,
            "entries": 0,
            "visits": 0,
            "complaints": 0,
            "reservations": 0
        }

    def add_to_bucket(value, key_name):
        timestamp = parse_datetime(value)
        if not timestamp:
            return

        bucket = buckets.get(ensure_timezone(timestamp).date())
        if not bucket:
            return

        bucket[key_name] += 1
        bucket["total"] += 1

    for entry_log in entry_logs:
        add_to_bucket(entry_log.get("timestamp"), "entries")

    for visitor in visitors:
        add_to_bucket(visitor.get("entryTime") or visitor.get("expectedDate") or visitor.get("createdAt"), "visits")

    for delivery in deliveries:
        add_to_bucket(delivery.get("entryTime") or delivery.get("createdAt"), "visits")

    for complaint in complaints:
        add_to_bucket(complaint.get("createdAt"), "complaints")

    for reservation in reservations:
        add_to_bucket(reservation.get("dateReserved") or reservation.get("createdAt"), "reservations")

    return list(buckets.values())


def calculate_duration_minutes(start_value, end_value, now):
    start = parse_datetime(start_value)
    end = parse_datetime(end_value)

    if not start:
        return None

    if not end:
        end = now

    duration = ensure_timezone(end) - ensure_timezone(start)
    return max(0.0, duration.total_seconds() / 60.0)


def build_repeat_visitors(visitors):
    grouped = defaultdict(list)

    for visitor in visitors:
        grouped[safe_label(visitor.get("name"))].append(visitor)

    repeat_entries = []

    for name, visitor_group in grouped.items():
        if len(visitor_group) < 2:
            continue

        latest_visit = None
        host_name = "Unassigned"

        for visitor in visitor_group:
            host_name = safe_label(visitor.get("hostResidentName"), host_name)
            visit_time = parse_datetime(visitor.get("entryTime") or visitor.get("createdAt"))
            if visit_time and (latest_visit is None or ensure_timezone(visit_time) > ensure_timezone(latest_visit)):
                latest_visit = visit_time

        repeat_entries.append(
            {
                "name": name,
                "count": len(visitor_group),
                "host": host_name,
                "lastSeen": to_iso(latest_visit)
            }
        )

    repeat_entries.sort(key=lambda item: (-item["count"], item["name"]))
    return repeat_entries[:5]


def build_busiest_hosts(visitors, deliveries):
    counter = Counter()

    for visitor in visitors:
        counter[safe_label(visitor.get("hostResidentName"))] += 1

    for delivery in deliveries:
        counter[safe_label(delivery.get("hostResidentName"))] += 1

    return [
        {"label": label, "count": count}
        for label, count in counter.most_common(5)
    ]


def build_guard_activity(entry_logs):
    grouped = defaultdict(lambda: {"count": 0, "entries": 0, "exits": 0, "afterHours": 0})

    for entry_log in entry_logs:
        guard_name = safe_label(entry_log.get("recordedByName") or entry_log.get("recordedByRole"), "Unassigned")
        grouped[guard_name]["count"] += 1

        log_type = safe_label(entry_log.get("logType")).lower()
        if log_type == "entry":
            grouped[guard_name]["entries"] += 1
        elif log_type == "exit":
            grouped[guard_name]["exits"] += 1

        timestamp = parse_datetime(entry_log.get("timestamp"))
        if timestamp:
            timestamp = ensure_timezone(timestamp)
            if timestamp.hour >= 22 or timestamp.hour < 5:
                grouped[guard_name]["afterHours"] += 1

    return [
        {
            "name": name,
            "count": values["count"],
            "entries": values["entries"],
            "exits": values["exits"],
            "afterHours": values["afterHours"]
        }
        for name, values in sorted(
            grouped.items(),
            key=lambda item: (-item[1]["count"], -item[1]["afterHours"], item[0])
        )[:5]
    ]


def build_plate_overview(entry_logs):
    grouped = defaultdict(lambda: {"count": 0, "entries": 0, "exits": 0, "ownerTypes": Counter()})
    no_vehicle_count = 0

    for entry_log in entry_logs:
        plate_number = safe_label(entry_log.get("plateNumber"), "NO-VEHICLE")
        if plate_number == "NO-VEHICLE":
            no_vehicle_count += 1
            continue

        grouped[plate_number]["count"] += 1

        log_type = safe_label(entry_log.get("logType")).lower()
        if log_type == "entry":
            grouped[plate_number]["entries"] += 1
        elif log_type == "exit":
            grouped[plate_number]["exits"] += 1

        owner_type = safe_label(entry_log.get("vehicleOwnerType")).title()
        grouped[plate_number]["ownerTypes"][owner_type] += 1

    frequent_plates = [
        {
            "label": plate_number,
            "count": values["count"],
            "entries": values["entries"],
            "exits": values["exits"],
            "ownerType": values["ownerTypes"].most_common(1)[0][0] if values["ownerTypes"] else "Unknown"
        }
        for plate_number, values in sorted(
            grouped.items(),
            key=lambda item: (-item[1]["count"], item[0])
        )[:5]
    ]

    imbalances = []
    for plate_number, values in grouped.items():
        delta = values["entries"] - values["exits"]
        if delta == 0:
            continue

        imbalances.append(
            {
                "plateNumber": plate_number,
                "delta": delta,
                "entries": values["entries"],
                "exits": values["exits"],
                "direction": "More entries" if delta > 0 else "More exits"
            }
        )

    imbalances.sort(key=lambda item: (-abs(item["delta"]), -item["entries"], item["plateNumber"]))

    return {
        "uniquePlates": len(grouped),
        "noVehicleCount": no_vehicle_count,
        "frequentPlates": frequent_plates,
        "entryExitImbalance": imbalances[:5]
    }


def build_vehicle_insights(residents, window_start):
    active_vehicles = []
    residents_with_vehicles = 0
    recent_registrations = 0
    photo_count = 0

    for resident in residents:
        vehicles = [
            vehicle
            for vehicle in (resident.get("vehicles") or [])
            if not vehicle.get("deletedAt")
        ]

        if vehicles:
            residents_with_vehicles += 1

        for vehicle in vehicles:
            active_vehicles.append(vehicle)

            if vehicle.get("hasPhoto"):
                photo_count += 1

            registered_date = parse_datetime(vehicle.get("registeredDate"))
            if registered_date and ensure_timezone(registered_date) >= window_start:
                recent_registrations += 1

    total_vehicles = len(active_vehicles)
    photo_coverage = (photo_count / total_vehicles * 100.0) if total_vehicles else 0.0

    return {
        "totalVehicles": total_vehicles,
        "residentsWithVehicles": residents_with_vehicles,
        "recentRegistrations": recent_registrations,
        "photoCoverage": round_number(photo_coverage, 1)
    }


def build_billing_insights(billings, now, billing_year):
    month_names = [
        "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
        "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
    ]
    current_year = ensure_timezone(now).year
    current_month_index = ensure_timezone(now).month - 1

    expected_amount = 0.0
    collected_amount = 0.0
    due_lines = 0
    paid_lines = 0
    pending_lines = 0
    rejected_lines = 0
    verified_lines = 0
    payment_method_counter = Counter()
    payment_status_counter = Counter()
    monthly_collection_rows = []

    for month_index, month_name in enumerate(month_names):
        month_expected = 0.0
        month_collected = 0.0
        month_paid_lines = 0
        month_pending_lines = 0

        month_is_due = billing_year < current_year or (billing_year == current_year and month_index <= current_month_index)
        if not month_is_due:
          monthly_collection_rows.append({
              "label": month_name.title()[:3],
              "expected": 0,
              "collected": 0,
              "paidLines": 0,
              "pendingLines": 0
          })
          continue

        for billing in billings:
            month_record = (billing.get("months") or {}).get(month_name) or {}
            monthly_due = float(billing.get("monthlyDue") or 0)
            payment_status = safe_label(month_record.get("paymentStatus"), "none").lower()
            payment_method = safe_label(month_record.get("paymentMethod"), "")
            paid = bool(month_record.get("paid")) or payment_status == "verified"

            expected_amount += monthly_due
            month_expected += monthly_due
            due_lines += 1

            payment_status_counter[payment_status.replace("_", " ").title()] += 1

            if payment_method:
                payment_method_counter[payment_method] += 1

            if paid:
                collected_amount += monthly_due
                month_collected += monthly_due
                paid_lines += 1
                month_paid_lines += 1

            if payment_status == "pending":
                pending_lines += 1
                month_pending_lines += 1
            elif payment_status == "rejected":
                rejected_lines += 1
            elif payment_status == "verified":
                verified_lines += 1

        monthly_collection_rows.append({
            "label": month_name.title()[:3],
            "expected": round_number(month_expected, 0),
            "collected": round_number(month_collected, 0),
            "paidLines": month_paid_lines,
            "pendingLines": month_pending_lines
        })

    collection_rate = (collected_amount / expected_amount * 100.0) if expected_amount else 0.0

    return {
        "billingYear": billing_year,
        "dueLines": due_lines,
        "paidLines": paid_lines,
        "pendingLines": pending_lines,
        "verifiedLines": verified_lines,
        "rejectedLines": rejected_lines,
        "expectedAmount": round_number(expected_amount, 0),
        "collectedAmount": round_number(collected_amount, 0),
        "outstandingAmount": round_number(max(0.0, expected_amount - collected_amount), 0),
        "collectionRate": round_number(collection_rate, 1),
        "paymentMethodBreakdown": [
            {"label": label, "count": count}
            for label, count in payment_method_counter.most_common(6)
        ],
        "paymentStatusBreakdown": [
            {"label": label, "count": count}
            for label, count in payment_status_counter.most_common()
        ],
        "monthlyCollection": monthly_collection_rows
    }


def build_qr_insights(visitors, reservations):
    visitor_qr_approved = [
        visitor for visitor in visitors
        if safe_label(visitor.get("reviewStatus")).lower() == "approved" and bool(visitor.get("qrEntryEnabled"))
    ]
    facility_qr_enabled = [
        reservation for reservation in reservations
        if safe_label(reservation.get("status")).lower() == "approved" and bool(reservation.get("guestQrEnabled"))
    ]

    visitor_checkpoint_counter = Counter()
    visitor_mode_counter = Counter()
    completed_visitor_journeys = 0

    for visitor in visitor_qr_approved:
        checkpoints = visitor.get("qrCheckpoints") or []
        used_checkpoints = [checkpoint for checkpoint in checkpoints if checkpoint.get("usedAt")]
        used_keys = {safe_label(checkpoint.get("checkpoint")).lower() for checkpoint in used_checkpoints}

        for checkpoint in used_checkpoints:
            visitor_checkpoint_counter[safe_label(checkpoint.get("checkpoint")).replace("_", " ").title()] += 1
            visitor_mode_counter[safe_label(checkpoint.get("mode"), "scan").title()] += 1

        if {"gate_entry", "gate_exit"}.issubset(used_keys):
            completed_visitor_journeys += 1

    facility_mode_counter = Counter()
    facility_scan_events = 0
    facility_entries_used = 0
    facility_exits_used = 0

    for reservation in facility_qr_enabled:
        facility_entries_used += int(reservation.get("guestQrEntryUsed") or 0)
        facility_exits_used += int(reservation.get("guestQrExitUsed") or 0)
        scan_events = reservation.get("guestQrScanEvents") or []
        facility_scan_events += len(scan_events)
        for event in scan_events:
            facility_mode_counter[safe_label(event.get("mode"), "scan").title()] += 1

    return {
        "visitorQrApproved": len(visitor_qr_approved),
        "completedVisitorJourneys": completed_visitor_journeys,
        "visitorCheckpointBreakdown": [
            {"label": label, "count": count}
            for label, count in visitor_checkpoint_counter.most_common()
        ],
        "visitorModeBreakdown": [
            {"label": label, "count": count}
            for label, count in visitor_mode_counter.most_common()
        ],
        "facilityQrReservations": len(facility_qr_enabled),
        "facilityEntriesUsed": facility_entries_used,
        "facilityExitsUsed": facility_exits_used,
        "facilityScanEvents": facility_scan_events,
        "facilityModeBreakdown": [
            {"label": label, "count": count}
            for label, count in facility_mode_counter.most_common()
        ]
    }


def calculate_review_hours(created_at, reviewed_at):
    created = parse_datetime(created_at)
    reviewed = parse_datetime(reviewed_at)

    if not created or not reviewed:
        return None

    return max(0.0, (ensure_timezone(reviewed) - ensure_timezone(created)).total_seconds() / 3600.0)


def build_document_insights(documents):
    status_counter = Counter()
    type_counter = Counter()
    review_hours = []

    for document in documents:
        status_counter[safe_label(document.get("status")).replace("_", " ").title()] += 1
        type_counter[safe_label(document.get("documentType"))] += 1

        duration_hours = calculate_review_hours(document.get("createdAt"), document.get("reviewedAt"))
        if duration_hours is not None:
            review_hours.append(duration_hours)

    return {
        "totalDocuments": len(documents),
        "averageReviewHours": round_number(average(review_hours), 1),
        "statusBreakdown": [
            {"label": label, "count": count}
            for label, count in status_counter.most_common()
        ],
        "typeBreakdown": [
            {"label": label, "count": count}
            for label, count in type_counter.most_common()
        ]
    }


def build_response_insights(visitors, complaints, documents, billings):
    visitor_review_hours = []
    complaint_review_hours = []
    document_review_hours = []

    visitor_outcomes = Counter()
    complaint_outcomes = Counter()
    document_outcomes = Counter()
    payment_outcomes = Counter()

    for visitor in visitors:
        visitor_outcomes[safe_label(visitor.get("reviewStatus")).replace("_", " ").title()] += 1
        duration_hours = calculate_review_hours(visitor.get("createdAt"), visitor.get("reviewedAt"))
        if duration_hours is not None:
            visitor_review_hours.append(duration_hours)

    for complaint in complaints:
        complaint_outcomes[safe_label(complaint.get("status")).replace("_", " ").title()] += 1
        duration_hours = calculate_review_hours(complaint.get("createdAt"), complaint.get("reviewedAt"))
        if duration_hours is not None:
            complaint_review_hours.append(duration_hours)

    for document in documents:
        document_outcomes[safe_label(document.get("status")).replace("_", " ").title()] += 1
        duration_hours = calculate_review_hours(document.get("createdAt"), document.get("reviewedAt"))
        if duration_hours is not None:
            document_review_hours.append(duration_hours)

    for billing in billings:
        for month_record in (billing.get("months") or {}).values():
            payment_status = safe_label(month_record.get("paymentStatus"), "none").replace("_", " ").title()
            payment_outcomes[payment_status] += 1

    reviewed_visitor_count = sum(
        count for label, count in visitor_outcomes.items() if safe_label(label).lower() in {"approved", "rejected"}
    )
    rejected_visitor_count = visitor_outcomes.get("Rejected", 0)
    reviewed_document_count = sum(
        count for label, count in document_outcomes.items() if safe_label(label).lower() in {"approved", "rejected"}
    )
    rejected_document_count = document_outcomes.get("Rejected", 0)
    reviewed_payment_count = sum(
        count for label, count in payment_outcomes.items() if safe_label(label).lower() in {"verified", "rejected"}
    )
    rejected_payment_count = payment_outcomes.get("Rejected", 0)

    feedback_signals = []
    if reviewed_visitor_count > 0 and rejected_visitor_count / reviewed_visitor_count >= 0.35:
        feedback_signals.append(
            {
                "title": "Visitor approvals are being rejected often",
                "description": "Pre-registration quality is inconsistent. Review the required visitor fields and approval checklist."
            }
        )

    if reviewed_document_count > 0 and rejected_document_count / reviewed_document_count >= 0.3:
        feedback_signals.append(
            {
                "title": "Document submissions often need rework",
                "description": "Residents may need clearer document instructions because many reviewed submissions are rejected."
            }
        )

    if reviewed_payment_count > 0 and rejected_payment_count / reviewed_payment_count >= 0.25:
        feedback_signals.append(
            {
                "title": "Payment verification has a high rejection rate",
                "description": "Receipt or proof-of-payment quality is causing friction. Tighten instructions before residents submit."
            }
        )

    if average(complaint_review_hours) >= 72:
        feedback_signals.append(
            {
                "title": "Complaint response cycle is slow",
                "description": "Residents are waiting too long for complaint review. This can increase repeat reports and escalation."
            }
        )

    return {
        "visitorReviewHours": round_number(average(visitor_review_hours), 1),
        "complaintReviewHours": round_number(average(complaint_review_hours), 1),
        "documentReviewHours": round_number(average(document_review_hours), 1),
        "visitorOutcomeBreakdown": [
            {"label": label, "count": count}
            for label, count in visitor_outcomes.most_common()
        ],
        "complaintOutcomeBreakdown": [
            {"label": label, "count": count}
            for label, count in complaint_outcomes.most_common()
        ],
        "documentOutcomeBreakdown": [
            {"label": label, "count": count}
            for label, count in document_outcomes.most_common()
        ],
        "paymentOutcomeBreakdown": [
            {"label": label, "count": count}
            for label, count in payment_outcomes.most_common()
        ],
        "feedbackSignals": feedback_signals[:4]
    }


def build_facility_usage(reservations):
    weekday_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    weekday_counter = Counter()
    facility_totals = defaultdict(lambda: {"count": 0, "hours": 0.0, "guests": 0, "revenue": 0.0})

    approved_count = 0
    pending_count = 0
    duration_samples = []
    total_guests = 0
    approved_revenue = 0.0
    requested_revenue = 0.0

    for reservation in reservations:
        facility_name = safe_label(reservation.get("facilityName"))
        duration_hours = float(reservation.get("durationHours") or 0)
        guest_count = int(reservation.get("numberOfGuests") or 0)
        total_amount = float(reservation.get("totalAmount") or 0)
        status = safe_label(reservation.get("status")).lower()

        facility_totals[facility_name]["count"] += 1
        facility_totals[facility_name]["hours"] += duration_hours
        facility_totals[facility_name]["guests"] += guest_count
        facility_totals[facility_name]["revenue"] += total_amount

        total_guests += guest_count
        duration_samples.append(duration_hours)

        if status == "approved":
            approved_count += 1
        if status == "pending":
            pending_count += 1

        date_reserved = parse_datetime(reservation.get("dateReserved"))
        if date_reserved:
            weekday_counter[ensure_timezone(date_reserved).weekday()] += 1

        if status in {"approved", "pending"}:
            requested_revenue += total_amount
        if status == "approved":
            approved_revenue += total_amount

    total_reservations = len(reservations)
    approval_rate = (approved_count / total_reservations * 100.0) if total_reservations else 0.0

    busiest_facilities = [
        {
            "name": facility_name,
            "count": values["count"],
            "hours": round_number(values["hours"], 1),
            "guests": values["guests"],
            "revenue": round_number(values["revenue"], 0)
        }
        for facility_name, values in sorted(
            facility_totals.items(),
            key=lambda item: (-item[1]["count"], -item[1]["hours"], item[0])
        )[:5]
    ]

    weekday_trend = [
        {
            "label": weekday_labels[index],
            "count": weekday_counter.get(index, 0)
        }
        for index in range(7)
    ]

    return {
        "totalReservations": total_reservations,
        "approvedReservations": approved_count,
        "pendingReservations": pending_count,
        "approvalRate": round_number(approval_rate, 1),
        "averageDurationHours": round_number(average(duration_samples), 1),
        "totalGuests": total_guests,
        "approvedRevenue": round_number(approved_revenue, 0),
        "requestedRevenue": round_number(requested_revenue, 0),
        "estimatedRevenue": round_number(approved_revenue, 0),
        "busiestFacilities": busiest_facilities,
        "weekdayTrend": weekday_trend,
        "eventTypeBreakdown": count_breakdown(
            [safe_label(reservation.get("eventType")).replace("_", " ").title() for reservation in reservations]
        ),
        "paymentStatusBreakdown": count_breakdown(
            [safe_label(reservation.get("paymentStatus")).replace("_", " ").title() for reservation in reservations]
        ),
        "statusBreakdown": count_breakdown(
            [safe_label(reservation.get("status")).replace("_", " ").title() for reservation in reservations]
        )
    }


def build_complaint_insights(complaints):
    unresolved_statuses = {"pending", "in_progress"}
    location_counter = Counter()
    unresolved_count = 0
    resolved_count = 0

    for complaint in complaints:
        status = safe_label(complaint.get("status")).lower()
        location = safe_label(complaint.get("location") or complaint.get("subject"), "Unspecified")
        location_counter[location] += 1

        if status in unresolved_statuses:
            unresolved_count += 1
        if status == "resolved":
            resolved_count += 1

    hotspots = [
        {"label": label, "count": count}
        for label, count in location_counter.most_common(5)
    ]

    return {
        "totalComplaints": len(complaints),
        "unresolvedCount": unresolved_count,
        "resolvedCount": resolved_count,
        "hotspots": hotspots,
        "categoryBreakdown": count_breakdown(
            [safe_label(complaint.get("category")).replace("_", " ").title() for complaint in complaints]
        ),
        "urgencyBreakdown": count_breakdown(
            [safe_label(complaint.get("urgency")).replace("_", " ").title() for complaint in complaints]
        ),
        "statusBreakdown": count_breakdown(
            [safe_label(complaint.get("status")).replace("_", " ").title() for complaint in complaints]
        )
    }


def detect_after_hours_activity(entry_logs):
    anomalies = []
    count = 0

    for entry_log in entry_logs:
        timestamp = parse_datetime(entry_log.get("timestamp"))
        if not timestamp:
            continue

        timestamp = ensure_timezone(timestamp)
        if timestamp.hour >= 22 or timestamp.hour < 5:
            count += 1
            vehicle_owner_type = safe_label(entry_log.get("vehicleOwnerType"), "access").lower()
            log_type = safe_label(entry_log.get("logType"), "entry").lower()

            if vehicle_owner_type in {"resident", "owner", "household"}:
                continue

            anomalies.append(
                {
                    "category": "after_hours_access",
                    "severity": "high" if log_type == "entry" else "medium",
                    "title": "After-hours non-resident access",
                    "summary": f"{safe_label(entry_log.get('plateNumber'), 'No plate')} was logged at {format_hour_label(timestamp.hour)}.",
                    "timestamp": to_iso(timestamp),
                    "confidence": 0.79,
                    "details": {
                        "plateNumber": safe_label(entry_log.get("plateNumber"), "No plate"),
                        "ownerType": vehicle_owner_type.title(),
                        "logType": log_type.title()
                    }
                }
            )

    return count, anomalies[:4]


def detect_plate_bursts(entry_logs):
    grouped = defaultdict(list)

    for entry_log in entry_logs:
        plate_number = safe_label(entry_log.get("plateNumber"), "")
        timestamp = parse_datetime(entry_log.get("timestamp"))
        if not plate_number or plate_number == "NO-VEHICLE" or not timestamp:
            continue

        grouped[plate_number].append(ensure_timezone(timestamp))

    anomalies = []

    for plate_number, timestamps in grouped.items():
        timestamps.sort()
        burst_start = None
        burst_count = 1

        for index in range(1, len(timestamps)):
            if (timestamps[index] - timestamps[index - 1]).total_seconds() <= 3600:
                burst_count += 1
                burst_start = burst_start or timestamps[index - 1]
            else:
                if burst_count >= 4 and burst_start:
                    anomalies.append(
                        {
                            "category": "rapid_repeat_access",
                            "severity": "high",
                            "title": "Rapid repeated gate movement",
                            "summary": f"{plate_number} was recorded {burst_count} times within an hour.",
                            "timestamp": to_iso(burst_start),
                            "confidence": 0.84,
                            "details": {
                                "plateNumber": plate_number,
                                "events": burst_count
                            }
                        }
                    )
                    break

                burst_start = None
                burst_count = 1

        if burst_count >= 4 and burst_start:
            anomalies.append(
                {
                    "category": "rapid_repeat_access",
                    "severity": "high",
                    "title": "Rapid repeated gate movement",
                    "summary": f"{plate_number} was recorded {burst_count} times within an hour.",
                    "timestamp": to_iso(burst_start),
                    "confidence": 0.84,
                    "details": {
                        "plateNumber": plate_number,
                        "events": burst_count
                    }
                }
            )

    return anomalies[:3]


def detect_overstays(visitors, deliveries, now):
    anomalies = []
    overstay_count = 0
    visitor_limit_minutes = 6 * 60
    delivery_limit_minutes = 3 * 60

    for visitor in visitors:
        duration_minutes = calculate_duration_minutes(visitor.get("entryTime"), visitor.get("exitTime"), now)
        if duration_minutes is None:
            continue

        if duration_minutes < visitor_limit_minutes:
            continue

        if safe_label(visitor.get("status")).lower() == "inside" or visitor.get("exitTime"):
            overstay_count += 1
            anomalies.append(
                {
                    "category": "visitor_overstay",
                    "severity": "high" if duration_minutes >= 12 * 60 else "medium",
                    "title": "Visitor stay needs review",
                    "summary": f"{safe_label(visitor.get('name'))} has been active for about {int(duration_minutes // 60)} hour(s).",
                    "timestamp": to_iso(parse_datetime(visitor.get("entryTime") or visitor.get("createdAt"))),
                    "confidence": 0.76,
                    "details": {
                        "hostResident": safe_label(visitor.get("hostResidentName")),
                        "status": safe_label(visitor.get("status")).title(),
                        "durationMinutes": int(duration_minutes)
                    }
                }
            )

    for delivery in deliveries:
        duration_minutes = calculate_duration_minutes(delivery.get("entryTime"), delivery.get("exitTime"), now)
        if duration_minutes is None:
            continue

        if duration_minutes < delivery_limit_minutes:
            continue

        if safe_label(delivery.get("status")).lower() == "inside" or delivery.get("exitTime"):
            overstay_count += 1
            anomalies.append(
                {
                    "category": "delivery_overstay",
                    "severity": "high" if duration_minutes >= 6 * 60 else "medium",
                    "title": "Delivery stay exceeds normal window",
                    "summary": f"{safe_label(delivery.get('driverName'))} has remained active for about {int(duration_minutes // 60)} hour(s).",
                    "timestamp": to_iso(parse_datetime(delivery.get("entryTime") or delivery.get("createdAt"))),
                    "confidence": 0.73,
                    "details": {
                        "deliveryAddress": safe_label(delivery.get("deliveryAddress")),
                        "status": safe_label(delivery.get("status")).title(),
                        "durationMinutes": int(duration_minutes)
                    }
                }
            )

    return overstay_count, anomalies[:5]


def detect_complaint_clusters(complaints):
    unresolved_statuses = {"pending", "in_progress"}
    location_counter = Counter()

    for complaint in complaints:
        status = safe_label(complaint.get("status")).lower()
        if status not in unresolved_statuses:
            continue

        location = safe_label(complaint.get("location") or complaint.get("subject"), "Unspecified")
        location_counter[location] += 1

    anomalies = []
    for location, count in location_counter.most_common():
        if count < 2:
            continue

        anomalies.append(
            {
                "category": "complaint_hotspot",
                "severity": "high" if count >= 4 else "medium",
                "title": "Complaint hotspot detected",
                "summary": f"{location} generated {count} unresolved complaint report(s) in the active review set.",
                "timestamp": None,
                "confidence": 0.7,
                "details": {
                    "location": location,
                    "reports": count
                }
            }
        )

    return anomalies[:3]


def build_ml_anomalies(entry_logs, visitors, deliveries, now):
    if not ML_ENABLED:
        return []

    event_vectors = []

    owner_type_map = {"resident": 0, "visitor": 1, "delivery": 2}
    status_map = {"pre-registered": 0, "inside": 1, "exited": 2}

    for entry_log in entry_logs:
        timestamp = parse_datetime(entry_log.get("timestamp"))
        if not timestamp:
            continue

        timestamp = ensure_timezone(timestamp)
        event_vectors.append(
            {
                "category": "ml_access_pattern",
                "title": "Machine-detected gate pattern",
                "summary": f"{safe_label(entry_log.get('plateNumber'), 'No plate')} differs from the usual gate pattern.",
                "timestamp": to_iso(timestamp),
                "details": {
                    "plateNumber": safe_label(entry_log.get("plateNumber"), "No plate"),
                    "ownerType": safe_label(entry_log.get("vehicleOwnerType")).title()
                },
                "features": [
                    float(timestamp.hour),
                    float(timestamp.weekday()),
                    float(owner_type_map.get(safe_label(entry_log.get("vehicleOwnerType")).lower(), 3)),
                    1.0 if safe_label(entry_log.get("logType")).lower() == "entry" else 0.0,
                    0.0,
                    0.0
                ]
            }
        )

    for visitor in visitors:
        timestamp = parse_datetime(visitor.get("entryTime") or visitor.get("createdAt"))
        if not timestamp:
            continue

        timestamp = ensure_timezone(timestamp)
        duration_minutes = calculate_duration_minutes(visitor.get("entryTime"), visitor.get("exitTime"), now)
        event_vectors.append(
            {
                "category": "ml_visitor_pattern",
                "title": "Machine-detected visitor pattern",
                "summary": f"{safe_label(visitor.get('name'))} differs from recent visitor behavior.",
                "timestamp": to_iso(timestamp),
                "details": {
                    "visitor": safe_label(visitor.get("name")),
                    "hostResident": safe_label(visitor.get("hostResidentName"))
                },
                "features": [
                    float(timestamp.hour),
                    float(timestamp.weekday()),
                    10.0,
                    float(status_map.get(safe_label(visitor.get("status")).lower(), 3)),
                    float(duration_minutes or 0.0),
                    1.0 if visitor.get("vehiclePlateNumber") else 0.0
                ]
            }
        )

    for delivery in deliveries:
        timestamp = parse_datetime(delivery.get("entryTime") or delivery.get("createdAt"))
        if not timestamp:
            continue

        timestamp = ensure_timezone(timestamp)
        duration_minutes = calculate_duration_minutes(delivery.get("entryTime"), delivery.get("exitTime"), now)
        event_vectors.append(
            {
                "category": "ml_delivery_pattern",
                "title": "Machine-detected delivery pattern",
                "summary": f"{safe_label(delivery.get('driverName'))} differs from recent delivery behavior.",
                "timestamp": to_iso(timestamp),
                "details": {
                    "driverName": safe_label(delivery.get("driverName")),
                    "deliveryAddress": safe_label(delivery.get("deliveryAddress"))
                },
                "features": [
                    float(timestamp.hour),
                    float(timestamp.weekday()),
                    20.0,
                    float(status_map.get(safe_label(delivery.get("status")).lower(), 3)),
                    float(duration_minutes or 0.0),
                    1.0 if delivery.get("vehiclePlateNumber") else 0.0
                ]
            }
        )

    if len(event_vectors) < 18:
        return []

    np, IsolationForest = load_ml_dependencies()

    if np is None or IsolationForest is None:
        return []

    features = np.array([item["features"] for item in event_vectors], dtype=float)
    contamination = max(0.08, min(0.16, 6.0 / len(event_vectors)))

    model = IsolationForest(
        contamination=contamination,
        random_state=42
    )
    predictions = model.fit_predict(features)
    scores = -model.decision_function(features)

    flagged = []
    for index, prediction in enumerate(predictions):
        if prediction != -1:
            continue

        event = dict(event_vectors[index])
        score = float(scores[index])
        event["severity"] = "high" if score >= 0.1 else "medium"
        event["confidence"] = round_number(clamp(score + 0.55, 0.55, 0.93), 2)
        event["score"] = round_number(score, 3)
        event.pop("features", None)
        flagged.append(event)

    flagged.sort(key=lambda item: item.get("score", 0), reverse=True)
    return flagged[:3]


def build_highlights(hourly_activity, facility_usage, complaint_insights, repeat_visitors):
    highlights = []

    peak_hour = max(hourly_activity, key=lambda item: item["count"], default=None)
    if peak_hour and peak_hour["count"] > 0:
        highlights.append(
            {
                "title": "Peak gate activity window",
                "description": f"Access activity is busiest around {peak_hour['label']} with {peak_hour['count']} tracked movement(s).",
                "tone": "info"
            }
        )

    busiest_facility = (facility_usage.get("busiestFacilities") or [None])[0]
    if busiest_facility:
        highlights.append(
            {
                "title": "Top facility demand",
                "description": f"{busiest_facility['name']} handled {busiest_facility['count']} reservation(s) in the selected window.",
                "tone": "success"
            }
        )

    hotspot = (complaint_insights.get("hotspots") or [None])[0]
    if hotspot and hotspot["count"] > 0:
        highlights.append(
            {
                "title": "Complaint concentration",
                "description": f"{hotspot['label']} has the highest complaint volume with {hotspot['count']} report(s).",
                "tone": "warning"
            }
        )

    repeat_visitor = repeat_visitors[0] if repeat_visitors else None
    if repeat_visitor:
        highlights.append(
            {
                "title": "Frequent visitor observed",
                "description": f"{repeat_visitor['name']} appeared {repeat_visitor['count']} time(s), mostly linked to {repeat_visitor['host']}.",
                "tone": "info"
            }
        )

    return highlights[:4]


def build_recommendations(after_hours_ratio, overstay_count, unresolved_count, hotspot_count, anomaly_count, pending_reservations):
    recommendations = []

    if after_hours_ratio >= 10:
        recommendations.append(
            {
                "priority": "high",
                "title": "Strengthen after-hours monitoring",
                "description": "Increase gate verification and patrol checks between 10 PM and 5 AM, especially for non-resident access."
            }
        )

    if overstay_count > 0:
        recommendations.append(
            {
                "priority": "high",
                "title": "Audit active visits without exit logs",
                "description": "Review visitors and deliveries that remain marked inside for extended periods to prevent stale or missed exit records."
            }
        )

    if unresolved_count > 0 or hotspot_count > 0:
        recommendations.append(
            {
                "priority": "medium",
                "title": "Resolve complaint hotspots faster",
                "description": "Focus review and follow-up on repeated complaint locations to reduce recurring resident security reports."
            }
        )

    if pending_reservations >= 3:
        recommendations.append(
            {
                "priority": "medium",
                "title": "Clear facility approval backlog",
                "description": "Pending facility requests can hide crowding or schedule overlap risks. Review them sooner to keep activity forecasts accurate."
            }
        )

    if anomaly_count == 0 and after_hours_ratio < 8 and unresolved_count == 0:
        recommendations.append(
            {
                "priority": "low",
                "title": "Maintain current security baseline",
                "description": "Recent activity looks stable. Keep the current logging discipline and refresh the analytics window regularly."
            }
        )

    return recommendations[:4]


def build_session_watchlist(visitors, deliveries, now):
    watchlist = []

    for visitor in visitors:
        duration_minutes = calculate_duration_minutes(visitor.get("entryTime"), visitor.get("exitTime"), now)
        if duration_minutes is None:
            continue

        status = safe_label(visitor.get("status")).lower()
        if status != "inside" and duration_minutes < 6 * 60:
            continue

        watchlist.append(
            {
                "type": "visitor",
                "name": safe_label(visitor.get("name")),
                "context": safe_label(visitor.get("hostResidentName")),
                "status": safe_label(visitor.get("status")).title(),
                "durationMinutes": int(duration_minutes),
                "enteredAt": to_iso(parse_datetime(visitor.get("entryTime") or visitor.get("createdAt")))
            }
        )

    for delivery in deliveries:
        duration_minutes = calculate_duration_minutes(delivery.get("entryTime"), delivery.get("exitTime"), now)
        if duration_minutes is None:
            continue

        status = safe_label(delivery.get("status")).lower()
        if status != "inside" and duration_minutes < 3 * 60:
            continue

        watchlist.append(
            {
                "type": "delivery",
                "name": safe_label(delivery.get("driverName")),
                "context": safe_label(delivery.get("deliveryAddress") or delivery.get("hostResidentName")),
                "status": safe_label(delivery.get("status")).title(),
                "durationMinutes": int(duration_minutes),
                "enteredAt": to_iso(parse_datetime(delivery.get("entryTime") or delivery.get("createdAt")))
            }
        )

    watchlist.sort(
        key=lambda item: (
            0 if safe_label(item.get("status")).lower() == "inside" else 1,
            -int(item.get("durationMinutes") or 0),
            item.get("enteredAt") or ""
        )
    )
    return watchlist[:6]


def build_security_actions(after_hours_ratio, inside_count, unresolved_count, anomaly_count, pending_reservations, watchlist):
    actions = []

    if after_hours_ratio >= 10:
        actions.append(
            {
                "priority": "high",
                "title": "Tighten after-hours gate verification",
                "description": "Require guard verification and host confirmation for non-resident traffic between 10 PM and 5 AM."
            }
        )

    if inside_count > 0:
        actions.append(
            {
                "priority": "high" if inside_count >= 4 else "medium",
                "title": "Close open visitor and delivery sessions",
                "description": f"{inside_count} session(s) are still marked inside. Reconcile missed exits before the next shift handoff."
            }
        )

    if len(watchlist) >= 2:
        actions.append(
            {
                "priority": "medium",
                "title": "Review long-stay sessions",
                "description": "Several visits exceed the normal stay window. Check whether they are legitimate or stale logs."
            }
        )

    if unresolved_count >= 3:
        actions.append(
            {
                "priority": "medium",
                "title": "Escalate unresolved complaint clusters",
                "description": "Open resident reports are now large enough to affect security confidence and should be triaged first."
            }
        )

    if anomaly_count >= 3:
        actions.append(
            {
                "priority": "high",
                "title": "Run targeted anomaly review",
                "description": "The current window contains multiple flagged access patterns. Validate them before they repeat across shifts."
            }
        )

    if pending_reservations >= 3:
        actions.append(
            {
                "priority": "medium",
                "title": "Clear reservation approval backlog",
                "description": "Pending facility approvals can hide guest traffic and crowding pressure from the guard team."
            }
        )

    if not actions:
        actions.append(
            {
                "priority": "low",
                "title": "Security posture is stable",
                "description": "No urgent security follow-up was generated for this window. Maintain current gate logging discipline."
            }
        )

    return actions[:5]


def calculate_risk_score(after_hours_ratio, overstay_count, unresolved_count, anomaly_count, hotspot_count):
    score = 10.0
    score += min(24.0, after_hours_ratio * 1.4)
    score += min(18.0, overstay_count * 5.0)
    score += min(18.0, unresolved_count * 4.0)
    score += min(20.0, anomaly_count * 4.5)
    score += min(14.0, hotspot_count * 4.0)

    if after_hours_ratio < 5 and overstay_count == 0 and unresolved_count == 0 and anomaly_count <= 1:
        score -= 8.0

    score = int(round(clamp(score, 8.0, 96.0)))

    if score >= 75:
        level = "critical"
    elif score >= 55:
        level = "high"
    elif score >= 30:
        level = "moderate"
    else:
        level = "low"

    return score, level


def build_indicators(after_hours_ratio, access_event_count, inside_count, unresolved_count, anomaly_count, pending_reservations, facility_approval_rate):
    return [
        {
            "label": "After-hours gate activity",
            "value": f"{round_number(after_hours_ratio, 1)}%",
            "severity": severity_for_ratio(after_hours_ratio, 6, 10, 16),
            "description": f"{int(round(after_hours_ratio / 100 * max(1, access_event_count)))} of {access_event_count} access events happened between 10 PM and 5 AM."
        },
        {
            "label": "Open visits without exit",
            "value": f"{inside_count} session(s)",
            "severity": severity_for_count(inside_count, 2, 4, 6),
            "description": "Visitors or deliveries still marked inside can signal missed exit logging or prolonged stays."
        },
        {
            "label": "Active complaint load",
            "value": f"{unresolved_count} unresolved",
            "severity": severity_for_count(unresolved_count, 2, 4, 6),
            "description": "Resident-submitted reports still waiting for resolution raise operational and security pressure."
        },
        {
            "label": "Detected anomalies",
            "value": f"{anomaly_count} flagged",
            "severity": severity_for_count(anomaly_count, 2, 4, 6),
            "description": "Combined heuristic and machine-assisted detections for unusual access and monitoring patterns."
        },
        {
            "label": "Facility approval pressure",
            "value": f"{round_number(facility_approval_rate, 1)}% approved",
            "severity": severity_for_count(pending_reservations, 2, 4, 6),
            "description": f"{pending_reservations} reservation(s) are still pending review inside the active facility queue."
        }
    ]


def build_summary(totals, entry_logs, visitors, deliveries, reservations, complaints, risk_score, risk_level, anomalies):
    monitored_events = len(entry_logs) + len(visitors) + len(deliveries) + len(reservations) + len(complaints)

    return {
        "riskScore": risk_score,
        "riskLevel": risk_level,
        "monitoredEvents": monitored_events,
        "totalResidents": int(totals.get("totalResidents") or 0),
        "entryLogs": len(entry_logs),
        "visitors": len(visitors),
        "deliveries": len(deliveries),
        "reservations": len(reservations),
        "complaints": len(complaints),
        "unresolvedComplaints": int(totals.get("unresolvedComplaints") or 0),
        "pendingReservations": int(totals.get("pendingReservations") or 0),
        "anomalyCount": len(anomalies)
    }


def analyze(payload):
    now = ensure_timezone(parse_datetime(payload.get("generatedAt")) or datetime.now(timezone.utc))
    window_start = ensure_timezone(parse_datetime(payload.get("windowStart")) or (now - timedelta(days=30)))
    window_days = int(payload.get("windowDays") or 30)
    totals = payload.get("totals") or {}
    billing_year = int(totals.get("billingYear") or ensure_timezone(now).year)

    entry_logs = payload.get("entryLogs") or []
    visitors = payload.get("visitors") or []
    deliveries = payload.get("deliveries") or []
    reservations = payload.get("facilityReservations") or []
    complaints = payload.get("complaints") or []
    residents = payload.get("residents") or []
    billings = payload.get("billings") or []
    documents = payload.get("documents") or []

    hourly_activity = build_hourly_activity(entry_logs, visitors, deliveries)
    daily_activity = build_daily_activity(window_start, now, entry_logs, visitors, deliveries, complaints, reservations)
    repeat_visitors = build_repeat_visitors(visitors)
    busiest_hosts = build_busiest_hosts(visitors, deliveries)
    guard_activity = build_guard_activity(entry_logs)
    plate_overview = build_plate_overview(entry_logs)
    facility_usage = build_facility_usage(reservations)
    complaint_insights = build_complaint_insights(complaints)
    vehicle_insights = build_vehicle_insights(residents, window_start)
    billing_insights = build_billing_insights(billings, now, billing_year)
    qr_insights = build_qr_insights(visitors, reservations)
    document_insights = build_document_insights(documents)
    response_insights = build_response_insights(visitors, complaints, documents, billings)

    after_hours_count, after_hours_anomalies = detect_after_hours_activity(entry_logs)
    burst_anomalies = detect_plate_bursts(entry_logs)
    overstay_count, overstay_anomalies = detect_overstays(visitors, deliveries, now)
    complaint_cluster_anomalies = detect_complaint_clusters(complaints)
    ml_anomalies = build_ml_anomalies(entry_logs, visitors, deliveries, now)

    anomaly_candidates = (
        after_hours_anomalies
        + burst_anomalies
        + overstay_anomalies
        + complaint_cluster_anomalies
        + ml_anomalies
    )

    deduped_anomalies = []
    seen_keys = set()
    for anomaly in anomaly_candidates:
        key = (
            anomaly.get("category"),
            anomaly.get("title"),
            anomaly.get("timestamp"),
            json.dumps(anomaly.get("details", {}), sort_keys=True)
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped_anomalies.append(anomaly)

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    deduped_anomalies.sort(
        key=lambda item: (
            severity_order.get(item.get("severity"), 3),
            -(item.get("confidence") or 0),
            item.get("timestamp") or ""
        )
    )
    anomalies = deduped_anomalies[:8]

    access_event_count = len(entry_logs) + len(visitors) + len(deliveries)
    total_access_events = max(1, access_event_count)
    after_hours_ratio = after_hours_count / total_access_events * 100.0
    inside_count = (
        sum(1 for visitor in visitors if safe_label(visitor.get("status")).lower() == "inside")
        + sum(1 for delivery in deliveries if safe_label(delivery.get("status")).lower() == "inside")
    )
    owner_type_breakdown = count_breakdown(
        [safe_label(entry_log.get("vehicleOwnerType")).title() for entry_log in entry_logs]
    )
    non_resident_access_count = sum(
        item.get("count", 0) for item in owner_type_breakdown if safe_label(item.get("label")).lower() != "resident"
    )
    unresolved_count = int(totals.get("unresolvedComplaints") or complaint_insights.get("unresolvedCount") or 0)
    hotspot_count = len([hotspot for hotspot in complaint_insights.get("hotspots", []) if hotspot.get("count", 0) >= 2])
    pending_reservations = int(totals.get("pendingReservations") or facility_usage.get("pendingReservations") or 0)
    session_watchlist = build_session_watchlist(visitors, deliveries, now)
    longest_open_session_minutes = max(
        [int(item.get("durationMinutes") or 0) for item in session_watchlist if safe_label(item.get("status")).lower() == "inside"],
        default=0
    )

    risk_score, risk_level = calculate_risk_score(
        after_hours_ratio,
        overstay_count,
        unresolved_count,
        len(anomalies),
        hotspot_count
    )

    indicators = build_indicators(
        after_hours_ratio,
        access_event_count,
        inside_count,
        unresolved_count,
        len(anomalies),
        pending_reservations,
        facility_usage.get("approvalRate") or 0
    )

    visitor_durations = [
        calculate_duration_minutes(visitor.get("entryTime"), visitor.get("exitTime"), now)
        for visitor in visitors
        if visitor.get("entryTime")
    ]
    delivery_durations = [
        calculate_duration_minutes(delivery.get("entryTime"), delivery.get("exitTime"), now)
        for delivery in deliveries
        if delivery.get("entryTime")
    ]
    peak_hour = max(hourly_activity, key=lambda item: item["count"], default={"label": "No activity", "count": 0})
    peak_hour_label = peak_hour.get("label") if peak_hour.get("count", 0) > 0 else "No activity yet"

    summary = build_summary(
        totals,
        entry_logs,
        visitors,
        deliveries,
        reservations,
        complaints,
        risk_score,
        risk_level,
        anomalies
    )

    return {
        "generatedAt": to_iso(now),
        "windowDays": window_days,
        "windowStart": to_iso(window_start),
        "engine": {
            "language": "python",
            "mode": "ml-enhanced" if ML_ENABLED and ML_IMPORT_ERROR is None else "heuristic",
            "mlAvailable": ML_ENABLED and ML_IMPORT_ERROR is None
        },
        "summary": summary,
        "highlights": build_highlights(hourly_activity, facility_usage, complaint_insights, repeat_visitors),
        "visitorBehavior": {
            "peakHourLabel": peak_hour_label,
            "peakHourCount": peak_hour.get("count", 0),
            "averageVisitMinutes": round_number(average(visitor_durations), 1),
            "averageDeliveryMinutes": round_number(average(delivery_durations), 1),
            "insideCount": inside_count,
            "preRegisteredCount": sum(
                1 for visitor in visitors if safe_label(visitor.get("status")).lower() == "pre-registered"
            ),
            "repeatVisitors": repeat_visitors,
            "busiestHosts": busiest_hosts,
            "purposeBreakdown": purpose_breakdown(visitors)
        },
        "vehicleInsights": vehicle_insights,
        "billingInsights": billing_insights,
        "qrInsights": qr_insights,
        "documentInsights": document_insights,
        "responseInsights": response_insights,
        "facilityUsage": facility_usage,
        "complaintInsights": complaint_insights,
        "security": {
            "indicators": indicators,
            "anomalies": anomalies,
            "recommendations": build_recommendations(
                after_hours_ratio,
                overstay_count,
                unresolved_count,
                hotspot_count,
                len(anomalies),
                pending_reservations
            ),
            "actionQueue": build_security_actions(
                after_hours_ratio,
                inside_count,
                unresolved_count,
                len(anomalies),
                pending_reservations,
                session_watchlist
            ),
            "hourlyActivity": hourly_activity,
            "dailyActivity": daily_activity,
            "ownerTypeBreakdown": owner_type_breakdown,
            "guardActivity": guard_activity,
            "plateOverview": plate_overview,
            "sessionWatchlist": session_watchlist,
            "posture": {
                "riskScore": risk_score,
                "riskLevel": risk_level,
                "afterHoursCount": after_hours_count,
                "afterHoursRatio": round_number(after_hours_ratio, 1),
                "insideCount": inside_count,
                "longestOpenSessionMinutes": longest_open_session_minutes,
                "nonResidentAccessCount": non_resident_access_count,
                "unresolvedCount": unresolved_count,
                "pendingReservations": pending_reservations
            }
        }
    }


def main():
    try:
        payload = json.load(sys.stdin)
        analytics = analyze(payload)
        json.dump(analytics, sys.stdout)
    except Exception as exc:
        sys.stderr.write(str(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
