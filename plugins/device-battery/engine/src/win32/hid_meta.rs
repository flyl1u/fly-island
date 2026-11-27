//! Read-only metadata of one HID collection, opened with no access rights: attributes,
//! capabilities, strings, and the two operations the standard-HID reader needs.
use super::{from_wide, to_wide};
use crate::hid::caps::{ButtonCap, Caps, ValueCap};
use windows::core::PCWSTR;
use windows::Win32::Devices::HumanInterfaceDevice::{
    HidD_FreePreparsedData, HidD_GetAttributes, HidD_GetFeature, HidD_GetInputReport,
    HidD_GetManufacturerString, HidD_GetPreparsedData, HidD_GetProductString,
    HidD_GetSerialNumberString, HidP_Feature, HidP_GetButtonCaps, HidP_GetCaps, HidP_GetUsageValue,
    HidP_GetValueCaps, HidP_InitializeReportForID, HidP_Input, HidP_Output, HIDD_ATTRIBUTES,
    HIDP_BUTTON_CAPS, HIDP_CAPS, HIDP_REPORT_TYPE, HIDP_STATUS_SUCCESS, HIDP_VALUE_CAPS,
    PHIDP_PREPARSED_DATA,
};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAGS_AND_ATTRIBUTES, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};

const MAX_CAPS: u16 = 512;
const TYPES: [HIDP_REPORT_TYPE; 3] = [HidP_Input, HidP_Output, HidP_Feature];

pub(crate) struct MetaDevice {
    handle: HANDLE,
    preparsed: PHIDP_PREPARSED_DATA,
}

pub(crate) struct Attributes {
    pub vendor_id: u16,
    pub product_id: u16,
    pub release_number: u16,
}

impl MetaDevice {
    pub(crate) fn open(path: &str) -> Option<Self> {
        let wide = to_wide(path);
        // SAFETY: `wide` is NUL terminated; desired access 0 never takes the device over.
        let handle = unsafe {
            CreateFileW(
                PCWSTR(wide.as_ptr()),
                0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                FILE_FLAGS_AND_ATTRIBUTES(0),
                None,
            )
        }
        .ok()?;
        Some(Self {
            handle,
            preparsed: PHIDP_PREPARSED_DATA::default(),
        })
    }

    pub(crate) fn attributes(&self) -> Option<Attributes> {
        let mut raw = HIDD_ATTRIBUTES {
            Size: size_of::<HIDD_ATTRIBUTES>() as u32,
            ..Default::default()
        };
        // SAFETY: the handle is open and `raw` carries its own size.
        unsafe { HidD_GetAttributes(self.handle, &mut raw) }.then_some(Attributes {
            vendor_id: raw.VendorID,
            product_id: raw.ProductID,
            release_number: raw.VersionNumber,
        })
    }

    /// Loads the preparsed data once and returns the collection's capabilities with
    /// every value and button capability. A list Windows cannot return completely is
    /// `None`, which no report-size proof accepts.
    pub(crate) fn caps(&mut self) -> Option<Caps> {
        if self.preparsed.0 == 0 {
            // SAFETY: the handle is open; the pointer is freed in `drop`.
            if !unsafe { HidD_GetPreparsedData(self.handle, &mut self.preparsed) } {
                return None;
            }
        }
        let mut raw = HIDP_CAPS::default();
        // SAFETY: the preparsed data is valid and `raw` is a live structure.
        if unsafe { HidP_GetCaps(self.preparsed, &mut raw) } != HIDP_STATUS_SUCCESS {
            return None;
        }
        let button_counts = [
            raw.NumberInputButtonCaps,
            raw.NumberOutputButtonCaps,
            raw.NumberFeatureButtonCaps,
        ];
        let value_counts = [
            raw.NumberInputValueCaps,
            raw.NumberOutputValueCaps,
            raw.NumberFeatureValueCaps,
        ];
        Some(Caps {
            usage_page: raw.UsagePage,
            usage: raw.Usage,
            lengths: [
                raw.InputReportByteLength,
                raw.OutputReportByteLength,
                raw.FeatureReportByteLength,
            ],
            button_counts,
            value_counts,
            buttons: std::array::from_fn(|i| self.button_caps(TYPES[i], button_counts[i])),
            values: std::array::from_fn(|i| self.value_caps(TYPES[i], value_counts[i])),
        })
    }

    fn value_caps(&self, kind: HIDP_REPORT_TYPE, count: u16) -> Option<Vec<ValueCap>> {
        if count == 0 {
            return Some(Vec::new());
        }
        if count > MAX_CAPS {
            return None;
        }
        let mut raw = vec![HIDP_VALUE_CAPS::default(); count as usize];
        let mut actual = count;
        // SAFETY: `raw` holds `count` entries and `actual` says so.
        let status =
            unsafe { HidP_GetValueCaps(kind, raw.as_mut_ptr(), &mut actual, self.preparsed) };
        if status != HIDP_STATUS_SUCCESS || actual != count {
            return None;
        }
        Some(
            raw.iter()
                .map(|cap| {
                    // SAFETY: `IsRange` selects the live member; both are plain integers
                    // and `NotRange.Usage` aliases `Range.UsageMin`.
                    let (usage_min, usage_max) = unsafe {
                        if cap.IsRange {
                            (cap.Anonymous.Range.UsageMin, cap.Anonymous.Range.UsageMax)
                        } else {
                            (cap.Anonymous.NotRange.Usage, cap.Anonymous.NotRange.Usage)
                        }
                    };
                    ValueCap {
                        usage_page: cap.UsagePage,
                        report_id: cap.ReportID,
                        alias: cap.IsAlias,
                        link: cap.LinkCollection,
                        bits: cap.BitSize,
                        count: cap.ReportCount,
                        is_range: cap.IsRange,
                        usage_min,
                        usage_max,
                        logical_min: cap.LogicalMin,
                        logical_max: cap.LogicalMax,
                    }
                })
                .collect(),
        )
    }

    fn button_caps(&self, kind: HIDP_REPORT_TYPE, count: u16) -> Option<Vec<ButtonCap>> {
        if count == 0 {
            return Some(Vec::new());
        }
        if count > MAX_CAPS {
            return None;
        }
        let mut raw = vec![HIDP_BUTTON_CAPS::default(); count as usize];
        let mut actual = count;
        // SAFETY: `raw` holds `count` entries and `actual` says so.
        let status =
            unsafe { HidP_GetButtonCaps(kind, raw.as_mut_ptr(), &mut actual, self.preparsed) };
        if status != HIDP_STATUS_SUCCESS || actual != count {
            return None;
        }
        Some(
            raw.iter()
                .map(|cap| {
                    // SAFETY: as for value capabilities.
                    let (usage_min, usage_max) = unsafe {
                        if cap.IsRange {
                            (cap.Anonymous.Range.UsageMin, cap.Anonymous.Range.UsageMax)
                        } else {
                            (cap.Anonymous.NotRange.Usage, cap.Anonymous.NotRange.Usage)
                        }
                    };
                    ButtonCap {
                        report_id: cap.ReportID,
                        alias: cap.IsAlias,
                        bit_field: cap.BitField,
                        is_range: cap.IsRange,
                        usage_min,
                        usage_max,
                        report_count: cap.ReportCount,
                    }
                })
                .collect(),
        )
    }

    /// Product, manufacturer and serial strings; empty when the device has none.
    pub(crate) fn strings(&self) -> [String; 3] {
        let getters = [
            HidD_GetProductString,
            HidD_GetManufacturerString,
            HidD_GetSerialNumberString,
        ];
        getters.map(|getter| {
            let mut buffer = [0u16; 256];
            // SAFETY: the byte length passed is the buffer's own size.
            let ok = unsafe {
                getter(
                    self.handle,
                    buffer.as_mut_ptr().cast(),
                    size_of_val(&buffer) as u32,
                )
            };
            if ok {
                from_wide(&buffer)
            } else {
                String::new()
            }
        })
    }

    /// Whether the preparsed data accepts `report_id` for both input and output. This
    /// works in memory only.
    pub(crate) fn supports_report_id(&self, report_id: u8, length: usize) -> bool {
        self.preparsed.0 != 0
            && [HidP_Input, HidP_Output].into_iter().all(|kind| {
                let mut buffer = vec![0u8; length];
                // SAFETY: the preparsed data is valid; the binding passes the length.
                let status = unsafe {
                    HidP_InitializeReportForID(kind, report_id, self.preparsed, &mut buffer)
                };
                status == HIDP_STATUS_SUCCESS
            })
    }

    /// Asks the device for one input report (GET_REPORT); nothing else is sent.
    pub(crate) fn input_report(&self, report_id: u8, length: usize) -> Option<Vec<u8>> {
        let mut report = vec![0u8; length.max(1)];
        report[0] = report_id;
        // SAFETY: the buffer is writable for exactly the length passed.
        let fetched = unsafe {
            HidD_GetInputReport(self.handle, report.as_mut_ptr().cast(), report.len() as u32)
        };
        fetched.then_some(report)
    }

    /// One declared Feature value: fetches the report and decodes the usage. Nothing is
    /// written to the device.
    pub(crate) fn feature_usage_value(
        &self,
        report_id: u8,
        length: usize,
        usage_page: u16,
        link: u16,
        usage: u16,
    ) -> Option<u32> {
        if self.preparsed.0 == 0 || length == 0 {
            return None;
        }
        let mut report = vec![0u8; length];
        report[0] = report_id;
        // SAFETY: the buffer is writable for exactly the length passed.
        let fetched = unsafe {
            HidD_GetFeature(self.handle, report.as_mut_ptr().cast(), report.len() as u32)
        };
        if !fetched {
            return None;
        }
        let mut value = 0u32;
        // SAFETY: the preparsed data is valid and the report is the one just fetched.
        let status = unsafe {
            HidP_GetUsageValue(
                HidP_Feature,
                usage_page,
                Some(link),
                usage,
                &mut value,
                self.preparsed,
                &report,
            )
        };
        (status == HIDP_STATUS_SUCCESS).then_some(value)
    }
}

impl Drop for MetaDevice {
    fn drop(&mut self) {
        if self.preparsed.0 != 0 {
            // SAFETY: obtained from HidD_GetPreparsedData and freed once.
            let _ = unsafe { HidD_FreePreparsedData(self.preparsed) };
        }
        // SAFETY: the handle was opened by `open` and is closed once.
        let _ = unsafe { CloseHandle(self.handle) };
    }
}
