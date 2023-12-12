import numbro from "numbro";

// using a currency library here in case we want to add more in future
export const formatDollarAmount = (
  num: number | undefined,
  digits = 2,
  round = true,
) => {
  if (num === 0) return "$0.00";
  if (!num) return "-";
  if (num < 0.001 && digits <= 3) {
    return "<$0.001";
  }

  return numbro(num).formatCurrency({
    average: round,
    mantissa: num > 1000 ? 2 : digits,
    abbreviations: {
      million: "M",
      billion: "B",
    },
  });
};

// using a currency library here in case we want to add more in future
export const formatAmount = (num: number | undefined, digits = 2) => {
  if (num === 0) return "0";
  if (!num) return "-";
  if (num < 0.001) {
    return "<0.001";
  }
  return numbro(num).format({
    average: true,
    mantissa: num > 1000 ? 2 : digits,
    abbreviations: {
      million: "M",
      billion: "B",
    },
  });
};


export const shortenEthAddress = (address: string, startLength: number = 6, endLength: number = 4, separator: string = "..."): string => {
  if (address.length < startLength + endLength + separator.length) {
    return address; // 如果地址长度本身比设定的简化长度还短，则不做修改
  }

  const startPart: string = address.substring(0, startLength);
  const endPart: string = address.substring(address.length - endLength);

  return `${startPart}${separator}${endPart}`;
};
