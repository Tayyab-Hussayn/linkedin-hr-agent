#!/bin/bash
# ================================================================
# PostFlow — Client Resource Management
# Save to: /home/krawin/exp.code/linkedin-hr-agent/
# Usage:   bash manage_clients.sh [command] [args]
# ================================================================

DB_CMD="docker exec -it la_postgres psql -U hragent -d linkedin_agent -p 5432 -c"

view_all_clients() {
  echo "=== ALL CLIENTS ==="
  $DB_CMD "
  SELECT c.id, c.name, cel.plan_name,
    cel.daily_post_limit, cel.monthly_post_limit,
    cel.can_analytics, cel.can_generate_now,
    cel.ai_model, c.limit_override_daily as override
  FROM clients c
  JOIN client_effective_limits cel ON cel.client_id = c.id
  ORDER BY c.id;"
}

view_all_plans() {
  echo "=== ALL PLANS ==="
  $DB_CMD "
  SELECT id, name, daily_post_limit, monthly_post_limit,
    can_schedule, can_custom_time, can_analytics,
    can_generate_now, ai_model, price_monthly
  FROM plans ORDER BY price_monthly;"
}

view_client() {
  CLIENT_ID=${1:-"hr-pro-001"}
  echo "=== CLIENT: $CLIENT_ID ==="
  $DB_CMD "
  SELECT c.id, c.name, c.plan_id, cel.plan_name,
    cel.daily_post_limit, cel.monthly_post_limit,
    cel.can_schedule, cel.can_custom_time,
    cel.can_analytics, cel.can_generate_now,
    cel.ai_model, cel.max_post_length,
    c.limit_override_daily as override,
    c.publishing_slots
  FROM clients c
  JOIN client_effective_limits cel ON cel.client_id = c.id
  WHERE c.id = '$CLIENT_ID';"
}

view_usage_today() {
  echo "=== TODAY'S USAGE ==="
  $DB_CMD "
  SELECT c.id, c.name, cel.plan_name,
    cel.daily_post_limit,
    COUNT(p.id) as posts_today,
    cel.daily_post_limit - COUNT(p.id) as remaining
  FROM clients c
  JOIN client_effective_limits cel ON cel.client_id = c.id
  LEFT JOIN posts p ON p.client_id = c.id AND p.created_at >= CURRENT_DATE
  GROUP BY c.id, c.name, cel.plan_name, cel.daily_post_limit
  ORDER BY c.id;"
}

view_usage_monthly() {
  echo "=== MONTHLY USAGE ==="
  $DB_CMD "
  SELECT c.id, c.name, cel.plan_name,
    cel.monthly_post_limit,
    COUNT(p.id) as posts_this_month,
    cel.monthly_post_limit - COUNT(p.id) as remaining
  FROM clients c
  JOIN client_effective_limits cel ON cel.client_id = c.id
  LEFT JOIN posts p ON p.client_id = c.id
    AND p.created_at >= DATE_TRUNC('month', CURRENT_DATE)
  GROUP BY c.id, c.name, cel.plan_name, cel.monthly_post_limit
  ORDER BY c.id;"
}

change_plan() {
  CLIENT_ID=${1:-"hr-pro-001"}
  PLAN_ID=${2:-"starter"}
  echo "Changing $CLIENT_ID to $PLAN_ID plan..."
  $DB_CMD "UPDATE clients SET plan_id = '$PLAN_ID' WHERE id = '$CLIENT_ID' RETURNING id, plan_id;"
}

set_override() {
  CLIENT_ID=${1:-"hr-pro-001"}
  LIMIT=${2:-"3"}
  echo "Setting daily override for $CLIENT_ID to $LIMIT posts/day..."
  $DB_CMD "UPDATE clients SET limit_override_daily = $LIMIT WHERE id = '$CLIENT_ID' RETURNING id, limit_override_daily;"
}

remove_override() {
  CLIENT_ID=${1:-"hr-pro-001"}
  echo "Removing override for $CLIENT_ID..."
  $DB_CMD "UPDATE clients SET limit_override_daily = NULL WHERE id = '$CLIENT_ID' RETURNING id, plan_id;"
}

update_plan_limit() {
  PLAN_ID=${1:-"starter"}
  NEW_LIMIT=${2:-"3"}
  echo "Updating $PLAN_ID plan daily limit to $NEW_LIMIT..."
  $DB_CMD "UPDATE plans SET daily_post_limit = $NEW_LIMIT WHERE id = '$PLAN_ID' RETURNING id, name, daily_post_limit;"
}

toggle_feature() {
  PLAN_ID=${1:-"growth"}
  FEATURE=${2:-"can_analytics"}
  VALUE=${3:-"true"}
  echo "Setting $PLAN_ID.$FEATURE = $VALUE..."
  $DB_CMD "UPDATE plans SET $FEATURE = $VALUE WHERE id = '$PLAN_ID' RETURNING id, name, $FEATURE;"
}

add_client() {
  CLIENT_ID=${1:-"client-002"}
  NAME=${2:-"New Client"}
  EMAIL=${3:-"client@example.com"}
  PLAN=${4:-"starter"}
  echo "Adding client $CLIENT_ID on $PLAN plan..."
  $DB_CMD "INSERT INTO clients (id, name, email, plan_id, publishing_slots) VALUES ('$CLIENT_ID', '$NAME', '$EMAIL', '$PLAN', '[\"18:00\"]') RETURNING id, name, plan_id;"
}

show_help() {
  echo "
================================================================
PostFlow Client Resource Management
================================================================

VIEW:
  bash manage_clients.sh                         show all clients + today usage
  bash manage_clients.sh view_plans              show all plans and features
  bash manage_clients.sh view_client hr-pro-001  show one client details
  bash manage_clients.sh usage_today             today post count per client
  bash manage_clients.sh usage_monthly           this month count per client

CHANGE CLIENT PLAN:
  bash manage_clients.sh change_plan hr-pro-001 free
  bash manage_clients.sh change_plan hr-pro-001 starter
  bash manage_clients.sh change_plan hr-pro-001 growth
  bash manage_clients.sh change_plan hr-pro-001 pro
  bash manage_clients.sh change_plan hr-pro-001 custom

OVERRIDE ONE CLIENT (without changing plan):
  bash manage_clients.sh set_override hr-pro-001 5     give 5 posts/day
  bash manage_clients.sh remove_override hr-pro-001    revert to plan default

UPDATE PLAN LIMITS (affects ALL clients on this plan):
  bash manage_clients.sh update_plan_limit free 2
  bash manage_clients.sh update_plan_limit starter 4
  bash manage_clients.sh update_plan_limit growth 8

TOGGLE PLAN FEATURES:
  bash manage_clients.sh toggle_feature starter can_analytics true
  bash manage_clients.sh toggle_feature free can_generate_now false
  bash manage_clients.sh toggle_feature growth can_custom_time true

ADD NEW CLIENT:
  bash manage_clients.sh add_client client-002 \"John Doe\" \"john@co.com\" starter

================================================================
PLANS:     free | starter | growth | pro | custom
FEATURES:  can_schedule | can_custom_time | can_analytics
           can_generate_now | can_edit_posts
================================================================"
}

case "${1}" in
  view_plans)        view_all_plans ;;
  view_client)       view_client "$2" ;;
  usage_today)       view_usage_today ;;
  usage_monthly)     view_usage_monthly ;;
  change_plan)       change_plan "$2" "$3" ;;
  set_override)      set_override "$2" "$3" ;;
  remove_override)   remove_override "$2" ;;
  update_plan_limit) update_plan_limit "$2" "$3" ;;
  toggle_feature)    toggle_feature "$2" "$3" "$4" ;;
  add_client)        add_client "$2" "$3" "$4" "$5" ;;
  help)              show_help ;;
  *)
    view_all_clients
    echo ""
    view_usage_today
    echo ""
    echo "Run: bash manage_clients.sh help   for all commands"
    ;;
esac
