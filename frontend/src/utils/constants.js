// FY and form constants

const generateFYYears = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = currentYear - 3; i <= currentYear + 1; i++) {
    years.push(`${i}-${i + 1}`);
  }
  return years;
};

export const FY_YEARS = generateFYYears();
export const CURRENT_FY = new Date().getMonth() < 3
  ? `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`
  : `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
export const SEASONS = ["Kharif", "Rabi"];

export const initialFormState = {
  date: new Date().toISOString().split("T")[0],
  kms_year: CURRENT_FY,
  season: "Kharif",
  truck_no: "",
  rst_no: "",
  tp_no: "",
  agent_name: "",
  mandi_name: "",
  kg: "",
  bag: "",
  g_deposite: "",
  gbw_cut: "",
  plastic_bag: "",
  cutting_percent: "",
  disc_dust_poll: "",
  g_issued: "",
  moisture: "",
  cash_paid: "",
  diesel_paid: "",
  remark: "",
};
