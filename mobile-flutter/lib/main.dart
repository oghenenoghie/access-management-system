import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'qr_scan_page.dart';

void main() {
  runApp(const EstateGateSecurityApp());
}

class EstateGateSecurityApp extends StatelessWidget {
  const EstateGateSecurityApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Royal Palms Gate Security',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F172A),
          primary: const Color(0xFF1D4ED8),
        ),
        useMaterial3: true,
      ),
      home: const SecurityGateHomeScreen(),
    );
  }
}

class SecurityGateHomeScreen extends StatefulWidget {
  const SecurityGateHomeScreen({super.key});

  @override
  State<SecurityGateHomeScreen> createState() => _SecurityGateHomeScreenState();
}

class _SecurityGateHomeScreenState extends State<SecurityGateHomeScreen> {
  // Pass --dart-define=API_BASE_URL=http://<PC LAN IP>:8000 to test on a real
  // phone. The default 10.0.2.2 only reaches the PC from the Android emulator.
  static const String _apiBaseRaw = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );
  final String apiBase = _apiBaseRaw.endsWith('/')
      ? _apiBaseRaw.substring(0, _apiBaseRaw.length - 1)
      : _apiBaseRaw;
  bool isAuthenticated = false;
  String officerName = 'Officer Samuel Okafor';
  String selectedGate = 'Main North Gate';
  String? jwtToken;

  final TextEditingController _emailCtrl =
      TextEditingController(text: 'security.north@royalpalmsestate.com');
  final TextEditingController _passCtrl =
      TextEditingController(text: 'Security@123');
  final TextEditingController _codeInputCtrl = TextEditingController();
  final TextEditingController _plateInputCtrl = TextEditingController();
  final TextEditingController _notesInputCtrl = TextEditingController();

  Map<String, dynamic>? verificationResult;
  bool isLoading = false;

  List<Map<String, dynamic>> activeVisitors = [
    {
      'id': 2,
      'code_entered': '739104',
      'visitor_name': 'Solar Tech Maintenance Team',
      'visitor_phone': '+2348087654321',
      'resident_name': 'Dr. Chioma Nwosu',
      'unit_number': 'Block B - Duplex 04',
      'vehicle_plate': 'APP-901-XY',
      'gate_name': 'Main North Gate',
      'entry_time': '10:52 AM',
      'exit_time': null,
      'action': 'entry_granted',
    },
  ];

  List<Map<String, dynamic>> electronicGateLogs = [
    {
      'id': 1,
      'code_entered': '510293',
      'visitor_name': 'DHL Express Courier',
      'resident_name': 'Engr. Adewale Banjo',
      'unit_number': 'Block A - Apt 101',
      'action': 'exit_recorded',
      'entry_time': '09:30 AM',
      'exit_time': '09:55 AM',
    },
    {
      'id': 3,
      'code_entered': '194822',
      'visitor_name': 'Grace Adebayo',
      'resident_name': 'Engr. Adewale Banjo',
      'unit_number': 'Block A - Apt 101',
      'action': 'entry_rejected',
      'rejection_reason': 'Code expired',
      'entry_time': '08:15 AM',
    },
  ];

  /// Signed in through the backend. When true the server is the source of
  /// truth for verification, admissions, exits and the logbook; when false the
  /// app runs on the built-in demo data only.
  bool get _isOnline => jwtToken != null;

  Map<String, String> get _authHeaders => {
        'Content-Type': 'application/json',
        if (jwtToken != null) 'Authorization': 'Bearer $jwtToken',
      };

  String _serverError(http.Response resp) {
    try {
      final detail = jsonDecode(resp.body)['detail'];
      if (detail != null) return '$detail';
    } catch (_) {}
    return 'HTTP ${resp.statusCode}';
  }

  void _showMessage(
    String text,
    Color color, {
    Duration duration = const Duration(seconds: 4),
  }) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(duration: duration, backgroundColor: color, content: Text(text)),
    );
  }

  /// Server times are UTC without a zone suffix; demo data already holds
  /// display strings such as '10:52 AM', which are shown unchanged.
  String _formatTime(dynamic value) {
    if (value == null) return '-';
    final raw = value.toString();
    final hasZone =
        raw.endsWith('Z') || RegExp(r'[+-]\d{2}:\d{2}$').hasMatch(raw);
    final parsed = DateTime.tryParse(hasZone ? raw : '${raw}Z');
    if (parsed == null) return raw;
    return TimeOfDay.fromDateTime(parsed.toLocal()).format(context);
  }

  Future<void> _refreshGateData() async {
    if (!_isOnline) return;
    try {
      final responses = await Future.wait([
        http.get(
          Uri.parse('$apiBase/api/security/active-visitors'),
          headers: _authHeaders,
        ),
        http.get(
          Uri.parse('$apiBase/api/security/recent-logs'),
          headers: _authHeaders,
        ),
      ]).timeout(const Duration(seconds: 5));
      final failed = responses.where((r) => r.statusCode != 200);
      if (failed.isNotEmpty) {
        _showMessage(
          'Could not load gate records: ${_serverError(failed.first)}',
          Colors.red.shade700,
        );
        return;
      }
      if (!mounted) return;
      setState(() {
        activeVisitors = List<Map<String, dynamic>>.from(
          jsonDecode(responses[0].body) as List,
        );
        electronicGateLogs = List<Map<String, dynamic>>.from(
          jsonDecode(responses[1].body) as List,
        );
      });
    } catch (_) {
      _showMessage(
        'Could not reach the server at $apiBase to load gate records.',
        Colors.red.shade700,
      );
    }
  }

  Future<void> _loginOfficer() async {
    setState(() => isLoading = true);
    String? serverProblem;
    try {
      final resp = await http
          .post(
            Uri.parse('$apiBase/api/auth/login'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'identifier': _emailCtrl.text.trim(),
              'password': _passCtrl.text,
            }),
          )
          .timeout(const Duration(seconds: 3));
      if (resp.statusCode == 200) {
        final data = jsonDecode(resp.body);
        jwtToken = data['access_token'];
        officerName = data['user']['full_name'];
        // Drop the built-in demo records; the server's records load below.
        activeVisitors = [];
        electronicGateLogs = [];
      } else {
        serverProblem =
            'The server at $apiBase refused the sign-in (HTTP ${resp.statusCode}).';
      }
    } catch (_) {
      // Uses local fallback credentials when offline
      serverProblem = 'Could not reach the server at $apiBase.';
    }
    if (!mounted) return;
    setState(() {
      isLoading = false;
      isAuthenticated = true;
    });
    if (serverProblem != null) {
      _showMessage(
        '$serverProblem Offline demo mode: only the built-in demo codes will '
        'verify, and nothing is saved to the server.',
        Colors.orange.shade800,
        duration: const Duration(seconds: 8),
      );
    } else {
      await _refreshGateData();
    }
  }

  /// Opens the camera scanner and verifies whatever QR code it reads.
  ///
  /// The full QR text is sent to the server, which accepts either a bare code
  /// or a pass payload; the input box shows just the 6-digit code.
  Future<void> _scanQrPass() async {
    final scanned = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const QrScanPage()),
    );
    if (!mounted || scanned == null) return;
    _codeInputCtrl.text = _codeFromQr(scanned);
    await _verifyAccessCode(scanned);
  }

  /// Pass QR codes look like `ESTATE-PASS|CODE:123456|UNIT:1|SIG:...`.
  String _codeFromQr(String raw) {
    final match = RegExp(r'CODE:\s*([0-9A-Za-z]+)').firstMatch(raw);
    return match?.group(1) ?? raw;
  }

  Future<void> _verifyAccessCode(String rawCode) async {
    final cleaned = rawCode.trim();
    if (cleaned.isEmpty) return;

    setState(() => isLoading = true);
    if (_isOnline) {
      String problem;
      try {
        final resp = await http
            .post(
              Uri.parse('$apiBase/api/security/verify'),
              headers: _authHeaders,
              body: jsonEncode({
                'code_or_qr': cleaned,
                'gate_name': selectedGate,
              }),
            )
            .timeout(const Duration(seconds: 5));

        if (resp.statusCode == 200) {
          if (!mounted) return;
          setState(() {
            verificationResult = jsonDecode(resp.body);
            isLoading = false;
          });
          // Rejected attempts are logged on the server; show them in the logbook.
          _refreshGateData();
          return;
        }
        problem = _serverError(resp);
      } catch (_) {
        problem = 'could not reach the server at $apiBase';
      }
      // Never fall back to demo rules while signed in: a demo "VALID" here
      // would admit a visitor the server has not approved.
      if (!mounted) return;
      setState(() {
        verificationResult = null;
        isLoading = false;
      });
      _showMessage('Verification failed: $problem.', Colors.red.shade700);
      return;
    }

    // Offline demo mode: local demonstration verification rules.
    // Compare the bare code, so scanned pass payloads match too.
    final code = _codeFromQr(cleaned);
    Map<String, dynamic> localResult;
    if (code == '482910') {
      localResult = {
        'is_valid': true,
        'verification_status': 'VALID',
        'message': 'VALID ACCESS CODE: Visitor is authorised for entry.',
        'resident_name': 'Engr. Adewale Banjo',
        'resident_phone': '+2348031112222',
        'unit_number': 'Block A - Apt 101',
        'access_code': {
          'code': '482910',
          'visitor_name': 'Michael Oluwaseun',
          'visitor_phone': '+2348091234567',
          'vehicle_plate': 'LSR-482-KJ',
          'purpose': 'Personal Visit',
          'code_type': 'one_time',
          'valid_until': 'Today, 19:30',
          'use_count': 0,
          'max_uses': 1,
        }
      };
    } else if (code == '739104') {
      localResult = {
        'is_valid': true,
        'verification_status': 'VALID',
        'message': 'VALID TEMPORARY PASS: Multi-entry contractor code.',
        'resident_name': 'Dr. Chioma Nwosu',
        'resident_phone': '+2348033334444',
        'unit_number': 'Block B - Duplex 04',
        'access_code': {
          'code': '739104',
          'visitor_name': 'Solar Tech Maintenance Team',
          'visitor_phone': '+2348087654321',
          'vehicle_plate': 'APP-901-XY',
          'purpose': 'Contractor / Maintenance',
          'code_type': 'temporary',
          'valid_until': 'Tomorrow, 12:00',
          'use_count': 1,
          'max_uses': 4,
        }
      };
    } else if (code == '510293') {
      localResult = {
        'is_valid': false,
        'verification_status': 'ALREADY_USED',
        'message':
            'REJECTED: One-time access code 510293 has already been used (1/1).',
        'resident_name': 'Engr. Adewale Banjo',
        'unit_number': 'Block A - Apt 101',
        'access_code': {
          'code': '510293',
          'visitor_name': 'DHL Express Courier',
          'visitor_phone': '+2348050009999',
          'code_type': 'one_time',
        }
      };
    } else if (code == '194822') {
      localResult = {
        'is_valid': false,
        'verification_status': 'EXPIRED',
        'message': 'REJECTED: Access code 194822 has expired.',
        'resident_name': 'Engr. Adewale Banjo',
        'unit_number': 'Block A - Apt 101',
        'access_code': {
          'code': '194822',
          'visitor_name': 'Grace Adebayo',
          'visitor_phone': '+2348071112233',
          'code_type': 'one_time',
        }
      };
    } else {
      localResult = {
        'is_valid': false,
        'verification_status': 'INVALID',
        'message':
            'REJECTED: Code "$code" does not exist in the Estate Database.',
      };
    }

    setState(() {
      verificationResult = localResult;
      isLoading = false;
    });
  }

  Future<void> _admitVisitor() async {
    if (verificationResult == null || verificationResult!['is_valid'] != true) {
      return;
    }
    final ac = verificationResult!['access_code'];

    if (_isOnline) {
      final plate = _plateInputCtrl.text.trim();
      final notes = _notesInputCtrl.text.trim();
      setState(() => isLoading = true);
      try {
        final resp = await http
            .post(
              Uri.parse('$apiBase/api/security/admit'),
              headers: _authHeaders,
              body: jsonEncode({
                'code': ac['code'],
                'gate_name': selectedGate,
                'vehicle_plate': plate.isNotEmpty ? plate.toUpperCase() : null,
                'notes': notes.isNotEmpty ? notes : null,
              }),
            )
            .timeout(const Duration(seconds: 5));
        if (!mounted) return;
        if (resp.statusCode == 200) {
          setState(() {
            verificationResult = null;
            _codeInputCtrl.clear();
            _plateInputCtrl.clear();
            _notesInputCtrl.clear();
          });
          _showMessage(
            'Entry granted for ${ac['visitor_name']} and saved. '
            'The resident has been notified.',
            Colors.green.shade700,
          );
          await _refreshGateData();
        } else {
          _showMessage(
            'Entry NOT recorded: ${_serverError(resp)}',
            Colors.red.shade700,
          );
        }
      } catch (_) {
        _showMessage(
          'Entry NOT recorded: could not reach the server at $apiBase. Try again.',
          Colors.red.shade700,
        );
      } finally {
        if (mounted) setState(() => isLoading = false);
      }
      return;
    }

    // Offline demo mode: update the on-screen lists only.
    final nowStr = TimeOfDay.now().format(context);

    final newEntry = {
      'id': DateTime.now().millisecondsSinceEpoch,
      'code_entered': ac['code'],
      'visitor_name': ac['visitor_name'],
      'visitor_phone': ac['visitor_phone'],
      'resident_name': verificationResult!['resident_name'],
      'unit_number': verificationResult!['unit_number'],
      'vehicle_plate': _plateInputCtrl.text.isNotEmpty
          ? _plateInputCtrl.text.toUpperCase()
          : (ac['vehicle_plate'] ?? 'N/A'),
      'gate_name': selectedGate,
      'entry_time': nowStr,
      'exit_time': null,
      'action': 'entry_granted',
    };

    setState(() {
      activeVisitors.insert(0, newEntry);
      electronicGateLogs.insert(0, newEntry);
      verificationResult = null;
      _codeInputCtrl.clear();
      _plateInputCtrl.clear();
      _notesInputCtrl.clear();
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: Colors.green.shade700,
        content: Text(
          'Entry granted for ${ac['visitor_name']} (offline demo, not saved to the server).',
        ),
      ),
    );
  }

  Future<void> _recordExit(int index) async {
    final visitor = activeVisitors[index];

    if (_isOnline) {
      setState(() => isLoading = true);
      try {
        final resp = await http
            .post(
              Uri.parse('$apiBase/api/security/exit/${visitor['id']}'),
              headers: _authHeaders,
            )
            .timeout(const Duration(seconds: 5));
        if (!mounted) return;
        if (resp.statusCode == 200) {
          final saved = jsonDecode(resp.body);
          _showMessage(
            'Exit recorded for ${visitor['visitor_name']} at '
            '${_formatTime(saved['exit_time'])}.',
            Colors.blueGrey.shade700,
          );
          await _refreshGateData();
        } else {
          _showMessage(
            'Exit NOT recorded: ${_serverError(resp)}',
            Colors.red.shade700,
          );
        }
      } catch (_) {
        _showMessage(
          'Exit NOT recorded: could not reach the server at $apiBase. Try again.',
          Colors.red.shade700,
        );
      } finally {
        if (mounted) setState(() => isLoading = false);
      }
      return;
    }

    // Offline demo mode: update the on-screen lists only.
    final nowStr = TimeOfDay.now().format(context);
    setState(() {
      activeVisitors.removeAt(index);
      electronicGateLogs.insert(0, {
        ...visitor,
        'exit_time': nowStr,
        'action': 'exit_recorded',
      });
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Exit recorded for ${visitor['visitor_name']} at $nowStr.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!isAuthenticated) {
      return Scaffold(
        backgroundColor: const Color(0xFF0F172A),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Card(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'ESTATE SECURITY GATE TERMINAL',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF1D4ED8),
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Security Personnel Sign In',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 20),
                    TextField(
                      controller: _emailCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Officer ID / Email',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _passCtrl,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Password',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1D4ED8),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      onPressed: isLoading ? null : _loginOfficer,
                      child: const Text(
                        'Launch Gate Verification Terminal',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: const Color(0xFF0F172A),
          foregroundColor: Colors.white,
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$selectedGate • ${_isOnline ? 'Online' : 'Offline demo'}',
                style: TextStyle(
                  fontSize: 13,
                  color: _isOnline ? Colors.lightBlueAccent : Colors.orange,
                ),
              ),
              Text(
                officerName,
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          actions: [
            if (_isOnline)
              IconButton(
                tooltip: 'Refresh from server',
                icon: const Icon(Icons.refresh),
                onPressed: isLoading ? null : _refreshGateData,
              ),
          ],
          bottom: const TabBar(
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white60,
            indicatorColor: Colors.lightBlueAccent,
            tabs: [
              Tab(text: 'Verify Code / QR'),
              Tab(text: 'Inside Estate'),
              Tab(text: 'Gate Logbook'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            // TAB 1: REAL-TIME CODE & QR VERIFICATION
            SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            'Enter or Scan Visitor Access Code',
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Demo Codes: 482910 (Valid), 739104 (Temp), 510293 (Used), 194822 (Expired)',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _codeInputCtrl,
                            style: const TextStyle(
                              fontSize: 22,
                              letterSpacing: 4,
                              fontWeight: FontWeight.bold,
                            ),
                            decoration: const InputDecoration(
                              hintText: '6-Digit Code or QR',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: ElevatedButton.icon(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFF1D4ED8),
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                  ),
                                  onPressed: () =>
                                      _verifyAccessCode(_codeInputCtrl.text),
                                  icon: const Icon(Icons.verified_user),
                                  label: const Text('Verify Code'),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: OutlinedButton.icon(
                                  style: OutlinedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                  ),
                                  onPressed: isLoading ? null : _scanQrPass,
                                  icon: const Icon(Icons.qr_code_scanner),
                                  label: const Text('Scan QR Pass'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (verificationResult != null)
                    Card(
                      color: verificationResult!['is_valid'] == true
                          ? Colors.green.shade50
                          : Colors.red.shade50,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(
                          color: verificationResult!['is_valid'] == true
                              ? Colors.green.shade600
                              : Colors.red.shade600,
                          width: 2,
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              verificationResult!['verification_status'],
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w900,
                                color: verificationResult!['is_valid'] == true
                                    ? Colors.green.shade800
                                    : Colors.red.shade800,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(verificationResult!['message']),
                            const Divider(height: 24),
                            if (verificationResult!['access_code'] != null) ...[
                              Text(
                                'Visitor: ${verificationResult!['access_code']['visitor_name']}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                ),
                              ),
                              Text(
                                'Authorised By: ${verificationResult!['resident_name']} (${verificationResult!['unit_number']})',
                              ),
                              Text(
                                'Pass Type: ${verificationResult!['access_code']['code_type']}',
                              ),
                            ],
                            if (verificationResult!['is_valid'] == true) ...[
                              const SizedBox(height: 12),
                              TextField(
                                controller: _plateInputCtrl,
                                decoration: const InputDecoration(
                                  labelText: 'Confirm Vehicle Plate (Optional)',
                                  border: OutlineInputBorder(),
                                  filled: true,
                                  fillColor: Colors.white,
                                ),
                              ),
                              const SizedBox(height: 12),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.green.shade700,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 14),
                                ),
                                onPressed: isLoading ? null : _admitVisitor,
                                child: const Text(
                                  'GRANT ENTRY & LOG ARRIVAL TIME',
                                  style: TextStyle(fontWeight: FontWeight.bold),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),

            // TAB 2: ACTIVE VISITORS CURRENTLY INSIDE (RECORD EXIT)
            ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: activeVisitors.length,
              itemBuilder: (context, idx) {
                final v = activeVisitors[idx];
                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ListTile(
                    title: Text(
                      '${v['visitor_name']} (${v['code_entered']})',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    subtitle: Text(
                      'Host: ${v['resident_name']} • ${v['unit_number']}\nEntered: ${_formatTime(v['entry_time'])} • Plate: ${v['vehicle_plate'] ?? 'N/A'}',
                    ),
                    isThreeLine: true,
                    trailing: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange.shade800,
                        foregroundColor: Colors.white,
                      ),
                      onPressed: isLoading ? null : () => _recordExit(idx),
                      child: const Text('Log Exit'),
                    ),
                  ),
                );
              },
            ),

            // TAB 3: ELECTRONIC GATE LOGS
            ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: electronicGateLogs.length,
              itemBuilder: (context, idx) {
                final log = electronicGateLogs[idx];
                final isRejected = log['action'] == 'entry_rejected';
                return Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    leading: Icon(
                      isRejected ? Icons.cancel : Icons.check_circle,
                      color: isRejected ? Colors.red : Colors.green,
                    ),
                    title: Text(
                      '${log['visitor_name'] ?? 'Unknown visitor'} • Code: ${log['code_entered']}',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    subtitle: Text(
                      'Host: ${log['resident_name'] ?? '-'} (${log['unit_number'] ?? '-'})\n'
                      'Status: ${log['action']} ${log['exit_time'] != null ? "• Exited: ${_formatTime(log['exit_time'])}" : ""}'
                      '${log['rejection_reason'] != null ? "\nReason: ${log['rejection_reason']}" : ""}',
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
