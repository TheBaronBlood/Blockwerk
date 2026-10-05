// Lässt macOS den Hub am USB neu anmelden (wie Kabel ziehen und wieder einstecken).
#include <stdio.h>
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/IOCFPlugIn.h>
#include <IOKit/usb/IOUSBLib.h>

int main(void){
    CFMutableDictionaryRef match = IOServiceMatching("IOUSBHostDevice");
    int vid = 0x0694, pid = 0x0009;
    CFNumberRef v = CFNumberCreate(NULL, kCFNumberIntType, &vid), p = CFNumberCreate(NULL, kCFNumberIntType, &pid);
    CFDictionarySetValue(match, CFSTR("idVendor"), v); CFDictionarySetValue(match, CFSTR("idProduct"), p);
    io_service_t dev = IOServiceGetMatchingService(kIOMainPortDefault, match);
    if (!dev){ printf("kein Hub gefunden\n"); return 1; }
    IOCFPlugInInterface **plug = NULL; SInt32 score = 0;
    kern_return_t kr = IOCreatePlugInInterfaceForService(dev, kIOUSBDeviceUserClientTypeID, kIOCFPlugInInterfaceID, &plug, &score);
    if (kr != KERN_SUCCESS || !plug){ printf("Plug-in: %#x\n", kr); return 2; }
    IOUSBDeviceInterface **usb = NULL;
    (*plug)->QueryInterface(plug, CFUUIDGetUUIDBytes(kIOUSBDeviceInterfaceID), (LPVOID *)&usb);
    (*plug)->Release(plug);
    if (!usb){ printf("keine Geräteschnittstelle\n"); return 3; }
    kr = (*usb)->USBDeviceOpen(usb);
    printf("öffnen: %#x\n", kr);
    kr = (*usb)->USBDeviceReEnumerate(usb, 0);
    printf("neu anmelden: %#x\n", kr);
    (*usb)->USBDeviceClose(usb);
    (*usb)->Release(usb);
    return kr == KERN_SUCCESS ? 0 : 4;
}
