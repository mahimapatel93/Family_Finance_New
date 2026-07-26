#!/bin/bash

# Monitoring Server User Data
exec > /var/log/user-data.log 2>&1
set -euo pipefail

echo "=== Monitoring bootstrap started at $(date) ==="

ENVIRONMENT="${environment}"
AWS_REGION="${aws_region}"
GRAFANA_PASS="${grafana_pass}"

# System packages
dnf update -y
dnf install -y curl wget tar gzip --allowerasing

# Prometheus
echo "=== Installing Prometheus ==="

PROM_VERSION="2.51.2"
cd /tmp
curl -LO "https://github.com/prometheus/prometheus/releases/download/v$${PROM_VERSION}/prometheus-$${PROM_VERSION}.linux-amd64.tar.gz"
tar -xzf "prometheus-$${PROM_VERSION}.linux-amd64.tar.gz"

useradd -rs /bin/false prometheus 2>/dev/null || true
mkdir -p /etc/prometheus /var/lib/prometheus

cp "prometheus-$${PROM_VERSION}.linux-amd64/prometheus"        /usr/local/bin/prometheus
cp "prometheus-$${PROM_VERSION}.linux-amd64/promtool"          /usr/local/bin/promtool
cp -r "prometheus-$${PROM_VERSION}.linux-amd64/consoles"       /etc/prometheus/
cp -r "prometheus-$${PROM_VERSION}.linux-amd64/console_libraries" /etc/prometheus/
rm -rf "prometheus-$${PROM_VERSION}.linux-amd64"*

chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus

# Prometheus config — EC2 Service Discovery

cat > /etc/prometheus/prometheus.yml <<EOF
global:
  scrape_interval:     15s
  evaluation_interval: 15s
  external_labels:
    environment: '$ENVIRONMENT'
    region:      '$AWS_REGION'

rule_files:
  - "/etc/prometheus/rules/*.yml"

scrape_configs:

  # Prometheus self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node Exporter — backend instances (auto-discovered by tag)
  - job_name: 'node-backend'
    ec2_sd_configs:
      - region: $AWS_REGION
        port: 9100
        filters:
          - name: tag:Tier
            values: [backend]
          - name: tag:Environment
            values: [$ENVIRONMENT]
          - name: instance-state-name
            values: [running]
    relabel_configs:
      - source_labels: [__meta_ec2_instance_id]
        target_label: instance_id
      - source_labels: [__meta_ec2_availability_zone]
        target_label: az
      - source_labels: [__meta_ec2_tag_Name]
        target_label: name
      - target_label: tier
        replacement: backend

  # Node Exporter — frontend instances
  - job_name: 'node-frontend'
    ec2_sd_configs:
      - region: $AWS_REGION
        port: 9100
        filters:
          - name: tag:Tier
            values: [frontend]
          - name: tag:Environment
            values: [$ENVIRONMENT]
          - name: instance-state-name
            values: [running]
    relabel_configs:
      - source_labels: [__meta_ec2_instance_id]
        target_label: instance_id
      - source_labels: [__meta_ec2_availability_zone]
        target_label: az
      - source_labels: [__meta_ec2_tag_Name]
        target_label: name
      - target_label: tier
        replacement: frontend

  # Nginx Exporter — frontend instances
  - job_name: 'nginx'
    ec2_sd_configs:
      - region: $AWS_REGION
        port: 9113
        filters:
          - name: tag:Tier
            values: [frontend]
          - name: tag:Environment
            values: [$ENVIRONMENT]
          - name: instance-state-name
            values: [running]
    relabel_configs:
      - source_labels: [__meta_ec2_instance_id]
        target_label: instance_id
      - target_label: tier
        replacement: frontend

  # Monitoring server itself
  - job_name: 'monitoring-node'
    static_configs:
      - targets: ['localhost:9100']
        labels:
          instance_id: 'monitoring'
          tier: monitoring
EOF

chown prometheus:prometheus /etc/prometheus/prometheus.yml
mkdir -p /etc/prometheus/rules
chown -R prometheus:prometheus /etc/prometheus/rules

# Prometheus alerting rules

cat > /etc/prometheus/rules/family-finance.yml <<'RULESEOF'
groups:
  - name: family-finance-backend
    rules:
      - alert: BackendInstanceDown
        expr: up{job=~"node-backend"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Backend instance down"
          description: "Instance {{ $labels.instance_id }} has been down for >2min"

      - alert: BackendHighCPU
        expr: (100 - avg by(instance_id)(rate(node_cpu_seconds_total{mode="idle",job="node-backend"}[5m])*100)) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU on backend"
          description: "{{ $labels.instance_id }} CPU > 80% for 5min"

      - alert: BackendHighMemory
        expr: (1 - (node_memory_MemAvailable_bytes{job="node-backend"} / node_memory_MemTotal_bytes{job="node-backend"})) * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory on backend"
          description: "{{ $labels.instance_id }} memory > 85%"

      - alert: BackendDiskFull
        expr: (1 - (node_filesystem_avail_bytes{job="node-backend",mountpoint="/"} / node_filesystem_size_bytes{job="node-backend",mountpoint="/"})) * 100 > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Disk usage high on backend"
          description: "{{ $labels.instance_id }} disk > 80%"

  - name: family-finance-frontend
    rules:
      - alert: FrontendInstanceDown
        expr: up{job=~"node-frontend"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Frontend instance down"
          description: "Instance {{ $labels.instance_id }} has been down for >2min"

      - alert: NginxHighConnections
        expr: nginx_connections_active{job="nginx"} > 500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High nginx connections"
          description: "Nginx active connections > 500 on {{ $labels.instance_id }}"
RULESEOF

chown -R prometheus:prometheus /etc/prometheus/rules

# Prometheus systemd service
cat > /etc/systemd/system/prometheus.service <<'EOF'
[Unit]
Description=Prometheus Monitoring
After=network.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/usr/local/bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/var/lib/prometheus \
  --storage.tsdb.retention.time=30d \
  --storage.tsdb.retention.size=15GB \
  --web.console.libraries=/etc/prometheus/console_libraries \
  --web.console.templates=/etc/prometheus/consoles \
  --web.listen-address=0.0.0.0:9090 \
  --web.enable-lifecycle
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable prometheus
systemctl start prometheus
echo "=== Prometheus started on :9090 ==="

# Node Exporter on monitoring server itself

NODE_EXPORTER_VERSION="1.8.2"
cd /tmp
curl -LO "https://github.com/prometheus/node_exporter/releases/download/v$${NODE_EXPORTER_VERSION}/node_exporter-$${NODE_EXPORTER_VERSION}.linux-amd64.tar.gz"
tar -xzf "node_exporter-$${NODE_EXPORTER_VERSION}.linux-amd64.tar.gz"
mv "node_exporter-$${NODE_EXPORTER_VERSION}.linux-amd64/node_exporter" /usr/local/bin/node_exporter
chmod +x /usr/local/bin/node_exporter
useradd -rs /bin/false node_exporter 2>/dev/null || true

cat > /etc/systemd/system/node_exporter.service <<'EOF'
[Unit]
Description=Node Exporter
After=network.target

[Service]
User=node_exporter
Type=simple
ExecStart=/usr/local/bin/node_exporter --web.listen-address=:9100
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable node_exporter
systemctl start node_exporter

# Grafana

echo "=== Installing Grafana ==="

# Official Grafana repo
cat > /etc/yum.repos.d/grafana.repo <<'EOF'
[grafana]
name=grafana
baseurl=https://rpm.grafana.com
repo_gpgcheck=1
enabled=1
gpgcheck=1
gpgkey=https://rpm.grafana.com/gpg.key
sslverify=1
sslcacert=/etc/pki/tls/certs/ca-bundle.crt
EOF

dnf install -y grafana

# Grafana config

cat > /etc/grafana/grafana.ini <<GEOF
[server]
http_port = 3001
domain = 0.0.0.0
root_url = %(protocol)s://%(domain)s:%(http_port)s/grafana/
serve_from_sub_path = true

[security]
admin_user = admin
admin_password = $GRAFANA_PASS
secret_key = $(openssl rand -hex 32)
cookie_secure = false
cookie_samesite = lax

[auth.anonymous]
enabled = false

[users]
allow_sign_up = false
default_theme = dark

[dashboards]
default_home_dashboard_path = /var/lib/grafana/dashboards/family-finance-overview.json

[provisioning]
path = /etc/grafana/provisioning

[log]
mode = file
level = warn
filters = rendering:error

[database]
type = sqlite3
path = /var/lib/grafana/grafana.db

[analytics]
reporting_enabled = false
check_for_updates = false
GEOF

# Grafana provisioning 

mkdir -p /etc/grafana/provisioning/datasources
cat > /etc/grafana/provisioning/datasources/prometheus.yml <<'EOF'
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://localhost:9090
    isDefault: true
    editable: false
    jsonData:
      timeInterval: "15s"
      httpMethod: POST
EOF

# Grafana provisioning — auto-load dashboard JSON

mkdir -p /etc/grafana/provisioning/dashboards
cat > /etc/grafana/provisioning/dashboards/family-finance.yml <<'EOF'
apiVersion: 1
providers:
  - name: FamilyFinance
    orgId: 1
    folder: "Family Finance"
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards
EOF

mkdir -p /var/lib/grafana/dashboards


# Copy pre-built dashboard JSON 
cat > /var/lib/grafana/dashboards/family-finance-overview.json << 'DASHEOF'
{
  "__inputs": [],
  "__requires": [],
  "annotations": {"list": []},
  "editable": true,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 1,
  "id": null,
  "links": [],
  "panels": [
    {
      "collapsed": false,
      "gridPos": {"h": 1, "w": 24, "x": 0, "y": 0},
      "id": 100,
      "title": "Backend",
      "type": "row"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "palette-classic"},
          "custom": {"lineWidth": 2, "fillOpacity": 10},
          "unit": "percent"
        }
      },
      "gridPos": {"h": 8, "w": 8, "x": 0, "y": 1},
      "id": 1,
      "options": {"tooltip": {"mode": "multi"}},
      "targets": [
        {
          "expr": "100 - avg by(instance_id)(rate(node_cpu_seconds_total{mode=\"idle\",job=\"node-backend\"}[5m])*100)",
          "legendFormat": "{{instance_id}}",
          "refId": "A"
        }
      ],
      "title": "Backend CPU %",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "palette-classic"},
          "custom": {"lineWidth": 2, "fillOpacity": 10},
          "unit": "percent"
        }
      },
      "gridPos": {"h": 8, "w": 8, "x": 8, "y": 1},
      "id": 2,
      "targets": [
        {
          "expr": "(1-(node_memory_MemAvailable_bytes{job=\"node-backend\"}/node_memory_MemTotal_bytes{job=\"node-backend\"}))*100",
          "legendFormat": "{{instance_id}}",
          "refId": "A"
        }
      ],
      "title": "Backend Memory %",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "palette-classic"},
          "custom": {"lineWidth": 2, "fillOpacity": 10},
          "unit": "percent"
        }
      },
      "gridPos": {"h": 8, "w": 8, "x": 16, "y": 1},
      "id": 3,
      "targets": [
        {
          "expr": "(1-(node_filesystem_avail_bytes{job=\"node-backend\",mountpoint=\"/\"}/node_filesystem_size_bytes{job=\"node-backend\",mountpoint=\"/\"}))*100",
          "legendFormat": "{{instance_id}}",
          "refId": "A"
        }
      ],
      "title": "Backend Disk %",
      "type": "timeseries"
    },
    {
      "collapsed": false,
      "gridPos": {"h": 1, "w": 24, "x": 0, "y": 9},
      "id": 101,
      "title": "Frontend",
      "type": "row"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "palette-classic"},
          "custom": {"lineWidth": 2, "fillOpacity": 10},
          "unit": "percent"
        }
      },
      "gridPos": {"h": 8, "w": 8, "x": 0, "y": 10},
      "id": 4,
      "targets": [
        {
          "expr": "100 - avg by(instance_id)(rate(node_cpu_seconds_total{mode=\"idle\",job=\"node-frontend\"}[5m])*100)",
          "legendFormat": "{{instance_id}}",
          "refId": "A"
        }
      ],
      "title": "Frontend CPU %",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "palette-classic"},
          "custom": {"lineWidth": 2, "fillOpacity": 10},
          "unit": "short"
        }
      },
      "gridPos": {"h": 8, "w": 8, "x": 8, "y": 10},
      "id": 5,
      "targets": [
        {
          "expr": "nginx_connections_active{job=\"nginx\"}",
          "legendFormat": "{{instance_id}}",
          "refId": "A"
        }
      ],
      "title": "Nginx Active Connections",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "palette-classic"},
          "custom": {"lineWidth": 2, "fillOpacity": 10},
          "unit": "reqps"
        }
      },
      "gridPos": {"h": 8, "w": 8, "x": 16, "y": 10},
      "id": 6,
      "targets": [
        {
          "expr": "rate(nginx_http_requests_total{job=\"nginx\"}[5m])",
          "legendFormat": "{{instance_id}}",
          "refId": "A"
        }
      ],
      "title": "Nginx Request Rate",
      "type": "timeseries"
    },
    {
      "collapsed": false,
      "gridPos": {"h": 1, "w": 24, "x": 0, "y": 18},
      "id": 102,
      "title": "Instance Health",
      "type": "row"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {"fixedColor": "green", "mode": "fixed"},
          "mappings": [
            {"options": {"0": {"color": "red", "text": "DOWN"}, "1": {"color": "green", "text": "UP"}}, "type": "value"}
          ],
          "thresholds": {"mode": "absolute", "steps": [{"color": "red", "value": null}, {"color": "green", "value": 1}]}
        }
      },
      "gridPos": {"h": 8, "w": 12, "x": 0, "y": 19},
      "id": 7,
      "options": {"colorMode": "background", "reduceOptions": {"calcs": ["lastNotNull"]}},
      "targets": [
        {
          "expr": "up{job=~\"node-backend|node-frontend\"}",
          "legendFormat": "{{tier}} - {{instance_id}}",
          "refId": "A"
        }
      ],
      "title": "Instance Status",
      "type": "stat"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {"mode": "palette-classic"},
          "unit": "short"
        }
      },
      "gridPos": {"h": 8, "w": 12, "x": 12, "y": 19},
      "id": 8,
      "options": {"colorMode": "background", "reduceOptions": {"calcs": ["lastNotNull"]}},
      "targets": [
        {
          "expr": "count(up{job=\"node-backend\"} == 1)",
          "legendFormat": "Backend instances",
          "refId": "A"
        },
        {
          "expr": "count(up{job=\"node-frontend\"} == 1)",
          "legendFormat": "Frontend instances",
          "refId": "B"
        }
      ],
      "title": "Running Instance Count",
      "type": "stat"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 38,
  "tags": ["family-finance", "infrastructure"],
  "templating": {"list": []},
  "time": {"from": "now-3h", "to": "now"},
  "timepicker": {},
  "timezone": "browser",
  "title": "Family Finance — Infrastructure Overview",
  "uid": "family-finance-infra",
  "version": 1
}
DASHEOF

chown -R grafana:grafana /var/lib/grafana /etc/grafana

###############################################################################
# Grafana systemd
###############################################################################
systemctl daemon-reload
systemctl enable grafana-server
systemctl start grafana-server
echo "=== Grafana started on :3001 ==="

###############################################################################
# Log rotation for Prometheus and Grafana
###############################################################################
cat > /etc/logrotate.d/monitoring <<'LREOF'
/var/log/grafana/grafana.log
/var/log/prometheus/*.log
{
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    size 50M
}
LREOF

echo "=== Monitoring bootstrap complete at $(date) ==="
echo "=== Grafana: http://$(curl -sf http://169.254.169.254/latest/meta-data/local-ipv4):3001/grafana ==="
echo "=== Prometheus: http://$(curl -sf http://169.254.169.254/latest/meta-data/local-ipv4):9090 ==="
