"""Spricht am Mac roh mit einem echten Hub am USB-Kabel (Pybricks-Firmware ab Beta 4.1).

Kein automatischer Test – ein Werkzeug für die Fehlersuche am Gerät. Nach jedem Schritt schickt es
eine Leseanfrage (Firmwareversion) als Lebenszeichen und meldet »lebt« oder »TOT«.

    python3 tests/hardware/usb-sonde.py                 nur das Lebenszeichen
    python3 tests/hardware/usb-sonde.py n63 n64         63, dann 64 Bytes in je einem Schreibvorgang
    python3 tests/hardware/usb-sonde.py s60+4 p63+1     zwei Schreibvorgänge direkt bzw. mit Pause

Damit gefunden (5.10.2026, Firmware 4.1.0b5, macOS): Jede USB-Übertragung, deren Länge ein
Vielfaches von 64 ist, legt den Empfang des Hubs lahm, bis das Kabel neu gesteckt wird. Der
Mac-Treiber teilt große Schreibvorgänge bei 448 Bytes und legt direkt aufeinanderfolgende zusammen.
Ohne Kabelziehen wieder in Gang bringen: usb-neu-anmelden.c (übersetzen mit
`clang -o usb-neu-anmelden tests/hardware/usb-neu-anmelden.c -framework IOKit -framework CoreFoundation`).
"""
import os, sys, time, termios, fcntl, struct, select, glob
DELIM, XOR, MAXD, OFF, MAXB, NOD = 0x02, 0x03, 0x02, 2, 84, 0xff
def encode(type_, payload=b''):
    out = [NOD]; code = 0; block = 1
    for b in bytes([type_]) + payload:
        if b > MAXD: out.append(b); block += 1
        if b <= MAXD or block > MAXB:
            if b <= MAXD: out[code] = b * MAXB + block + OFF
            out.append(NOD); code = len(out) - 1; block = 1
    out[code] = block + OFF
    return bytes(x ^ XOR for x in out) + bytes([DELIM])
READ_FW = encode(3, bytes([1, 0x26, 0x2a]))
def open_port():
    fd = os.open(glob.glob('/dev/cu.usbmodem*')[0], os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    a = termios.tcgetattr(fd); a[0] = 0; a[1] = 0; a[3] = 0; a[2] = termios.CS8 | termios.CREAD | termios.CLOCAL; a[4] = a[5] = termios.B115200
    termios.tcsetattr(fd, termios.TCSANOW, a)
    fcntl.ioctl(fd, termios.TIOCMBIS, struct.pack('I', termios.TIOCM_DTR))
    return fd
def drain(fd, seconds):
    end = time.time() + seconds; got = b''
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.05)
        if r:
            try: got += os.read(fd, 65536)
            except BlockingIOError: pass
    return got
def alive(fd, label):
    drain(fd, 0.2)
    os.write(fd, READ_FW)
    got = drain(fd, 1.2)
    ok = bytes([0x5b, 0x00, 0x0f, 0x25, 0x29]) in got     # Anfang der Antwort auf »Firmware lesen«
    print(f'{"lebt " if ok else "TOT  "} nach: {label}   ({len(got)} Bytes zurück)', flush=True)
    return ok
steps = sys.argv[1:]
fd = open_port()
if not alive(fd, 'Öffnen'): sys.exit(1)
for step in steps:
    if step == 'zu-auf':
        for _ in range(3): os.close(fd); time.sleep(0.4); fd = open_port(); time.sleep(0.3)
    elif step.startswith('n'):                       # nN: genau N Bytes in einem Schreibvorgang (lauter Endezeichen = leere Rahmen)
        os.write(fd, bytes([DELIM]) * int(step[1:])); time.sleep(0.3)
    elif step.startswith('s'):                       # sA+B: zwei Schreibvorgänge direkt hintereinander
        x, y = step[1:].split('+'); os.write(fd, bytes([DELIM]) * int(x)); os.write(fd, bytes([DELIM]) * int(y)); time.sleep(0.3)
    elif step.startswith('p'):                       # pA+B: zwei Schreibvorgänge mit kurzer Pause dazwischen
        x, y = step[1:].split('+'); os.write(fd, bytes([DELIM]) * int(x)); termios.tcdrain(fd); time.sleep(0.02); os.write(fd, bytes([DELIM]) * int(y)); time.sleep(0.3)
    elif step == 'abo':
        os.write(fd, encode(1, bytes([1]))); drain(fd, 1.0)
    elif step == 'abo-aus':
        os.write(fd, encode(1, bytes([0]))); drain(fd, 0.5)
    elif step == 'zu-ohne-lesen':                    # Anfrage schicken und sofort schließen, ohne die Antwort abzuholen
        os.write(fd, READ_FW); os.close(fd); time.sleep(1.5); fd = open_port(); time.sleep(0.3)
    elif step == 'abo-zu':                           # abonnieren und mitten in der Ereignisflut schließen
        os.write(fd, encode(1, bytes([1]))); time.sleep(0.3); os.close(fd); time.sleep(2.0); fd = open_port(); time.sleep(0.3)
    if not alive(fd, step): break
os.close(fd)
