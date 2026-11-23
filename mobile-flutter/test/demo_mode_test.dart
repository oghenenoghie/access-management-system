// Run both ways:
//   flutter test                            (debug default: demo mode on)
//   flutter test --dart-define=DEMO_MODE=false   (as in release builds)
import 'package:estate_gate_access_flutter/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('sign-in is pre-filled only in demo mode', (tester) async {
    await tester.pumpWidget(const EstateGateSecurityApp());

    final fields = tester.widgetList<TextField>(find.byType(TextField)).toList();
    expect(fields, hasLength(2));
    if (kDemoMode) {
      expect(fields[0].controller!.text, 'security.north@royalpalmsestate.com');
      expect(fields[1].controller!.text, isNotEmpty);
    } else {
      expect(fields[0].controller!.text, isEmpty);
      expect(fields[1].controller!.text, isEmpty);
    }
  });

  testWidgets('outside demo mode, a failed sign-in stays on the sign-in screen',
      (tester) async {
    if (kDemoMode) return; // covered by the DEMO_MODE=false run

    await tester.pumpWidget(const EstateGateSecurityApp());
    await tester.enterText(find.byType(TextField).at(0), 'officer@example.com');
    await tester.enterText(find.byType(TextField).at(1), 'not-a-real-password');
    // In widget tests every HTTP request gets a 400, i.e. the server refuses.
    await tester.tap(find.text('Launch Gate Verification Terminal'));
    await tester.pumpAndSettle();

    expect(find.text('Security Personnel Sign In'), findsOneWidget);
    expect(find.text('Verify Code / QR'), findsNothing);
    expect(find.textContaining('Sign-in refused'), findsOneWidget);

    // Let the message time out so no timers are left running.
    await tester.pump(const Duration(seconds: 10));
    await tester.pumpAndSettle();
  });
}
