# Cosmic Chef - micro:bit radio gateway (MakeCode Python, micro:bit V2)
#
# Flash this on the micro:bit plugged into the computer that runs the browser page
# (/dev/microbit-gateway.html). It forwards every radio packet it receives to USB serial.
#
# Serial, 115200 baud, one line per message:
#   browser -> gateway : GROUP,<n>            set the radio group (the team's group)
#   gateway -> browser : READY,<n>            booted, or confirms GROUP,<n>
#   gateway -> browser : RX,<serial>,<text>   radio packet from a terminal, <serial> is its device serial number
#
# Radio group is shown on the LED display when set.
# See docs/microbit-devices.md ("Radio gesture protocol") for the terminal side.

current_group = 31


def set_group(group):
    global current_group
    current_group = group
    radio.set_group(group)
    basic.show_number(group)
    serial.write_line("READY," + str(group))


def on_serial_line():
    line = serial.read_until(serial.delimiters(Delimiters.NEW_LINE)).strip()
    parts = line.split(",")
    if len(parts) == 2 and parts[0] == "GROUP":
        set_group(int(parts[1]))


def on_radio_string(received_string):
    serial_number = radio.received_packet(RadioPacketProperty.SERIAL_NUMBER)
    serial.write_line("RX," + str(serial_number) + "," + received_string)


serial.set_baud_rate(BaudRate.BAUD_RATE115200)
serial.on_data_received(serial.delimiters(Delimiters.NEW_LINE), on_serial_line)
radio.on_received_string(on_radio_string)

set_group(current_group)
