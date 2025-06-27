import { Button, Input } from "@usememos/mui";
import { LatLng } from "leaflet";
import { MapPinIcon, XIcon } from "lucide-react";
import React, { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import LeafletMap from "@/components/LeafletMap";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Location } from "@/types/proto/api/v1/memo_service";
import { useTranslate } from "@/utils/i18n";

const amapKey = import.meta.env.VITE_GAODE_API_KEY;

interface Props {
  location?: Location;
  onChange: (location?: Location) => void;
}

interface State {
  initilized: boolean;
  placeholder: string;
  position?: LatLng;
}

const LocationSelector = (props: Props) => {
  const t = useTranslate();
  const [state, setState] = useState<State>({
    initilized: false,
    placeholder: props.location?.placeholder || "",
    position: props.location ? new LatLng(props.location.latitude, props.location.longitude) : undefined,
  });
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false);
  // 新增：联想候选相关状态
  const [inputValue, setInputValue] = useState(state.placeholder);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setState((state) => ({
      ...state,
      placeholder: props.location?.placeholder || "",
      position: new LatLng(props.location?.latitude || 0, props.location?.longitude || 0),
    }));
  }, [props.location]);

  useEffect(() => {
    if (popoverOpen && !props.location) {
      const handleError = (error: any, errorMessage: string) => {
        setState(prev => ({ ...prev, initilized: true }));
        toast.error(errorMessage);
        console.error(error);
      };

      // 高德IP定位
      fetch(`https://restapi.amap.com/v3/ip?key=${amapKey}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === '1' && data.rectangle) {
            // rectangle: "lng1,lat1;lng2,lat2"，取中点
            const [lng1, lat1] = data.rectangle.split(';')[0].split(',');
            const [lng2, lat2] = data.rectangle.split(';')[1].split(',');
            const lat = (parseFloat(lat1) + parseFloat(lat2)) / 2;
            const lng = (parseFloat(lng1) + parseFloat(lng2)) / 2;
            setState(prev => ({
              ...prev,
              position: new LatLng(lat, lng),
              initilized: true,
            }));
          } else {
            handleError('No location from AMap', 'Failed to get location from AMap');
          }
        })
        .catch(error => {
          handleError(error, 'Failed to get location from AMap');
        });
    }
  }, [popoverOpen]);

  useEffect(() => {
    if (!state.position) {
      setState({ ...state, placeholder: "" });
      return;
    }

    // Fetch reverse geocoding data.
    // 下面代码依次是：只使用OSM，使用高德+OSM但是先尝试OSM，只使用高德（*，目前）
    //   fetch(`https://nominatim.openstreetmap.org/reverse?lat=${state.position.lat}&lon=${state.position.lng}&format=json`)
    //     .then((response) => response.json())
    //     .then((data) => {
    //       if (data && data.display_name) {
    //         setState({ ...state, placeholder: data.display_name });
    //       }
    //     })
    //     .catch((error) => {
    //       toast.error("Failed to fetch reverse geocoding data");
    //       console.error("Failed to fetch reverse geocoding data:", error);
    //     });
    // 先尝试 OpenStreetMap
    // fetch(`https://nominatim.openstreetmap.org/reverse?lat=${state.position.lat}&lon=${state.position.lng}&format=json`)
    //   .then((response) => response.json())
    //   .then((data) => {
    //     if (data && data.display_name) {
    //       setState({ ...state, placeholder: data.display_name });
    //     } else {
    //       throw new Error("No display_name in OSM response");
    //     }
    //   })
    //   .catch(() => {
      // 如果 OSM 失败，尝试高德
      fetch(
        `https://restapi.amap.com/v3/geocode/regeo?key=${amapKey}&location=${state.position.lng.toFixed(6)},${state.position.lat.toFixed(6)}&output=json`
      )
        .then((response) => response.json())
        .then((data) => {
          console.log("AMap response:", data);
          if (data && data.regeocode) {
            setState({ ...state, placeholder: data.regeocode.formatted_address });
          } else {
            toast.error("Failed to fetch reverse geocoding data from AMap");
          }
        })
        .catch((error) => {
          toast.error("Failed to fetch reverse geocoding data");
          console.error("Failed to fetch reverse geocoding data:", error);
        });
    // });
  }, [state.position]);

  const onPositionChanged = (position: LatLng) => {
    setState({ ...state, position });
  };

  const removeLocation = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    props.onChange(undefined);
  };

  // 联想输入处理
  useEffect(() => {
    if (!inputValue) {
      setSuggestions([]);
      return;
    }
    // 调用高德输入提示API
    const controller = new AbortController();
    fetch(`https://restapi.amap.com/v3/assistant/inputtips?key=${amapKey}&keywords=${encodeURIComponent(inputValue)}`,
      { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (data.status === '1' && data.tips) {
          setSuggestions(data.tips.filter((tip: any) => tip.location));
        } else {
          setSuggestions([]);
        }
      })
      .catch(() => setSuggestions([]));
    return () => controller.abort();
  }, [inputValue]);

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button className="flex items-center justify-center" size="sm" variant="plain">
          <MapPinIcon className="w-5 h-5 mx-auto shrink-0" />
          {props.location && (
            <>
              <span className="ml-0.5 text-sm text-ellipsis whitespace-nowrap overflow-hidden max-w-32">{props.location.placeholder}</span>
              <XIcon className="w-5 h-5 mx-auto shrink-0 hidden group-hover:block opacity-60 hover:opacity-80" onClick={removeLocation} />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center">
        <div className="min-w-80 sm:w-128 flex flex-col justify-start items-start relative">
          <LeafletMap key={state.position ? `${state.position.lat},${state.position.lng}` : 'init'} latlng={state.position} onChange={onPositionChanged} />
          <div className="mt-2 w-full flex flex-row justify-between items-center gap-2">
            <div className="flex flex-row items-center justify-start gap-2 relative w-full">
              <Input
                // ref={inputRef}
                style={{ width: "300px" }}
                placeholder="请先选择一个位置或输入地址"
                value={inputValue}
                size="sm"
                startDecorator={
                  state.position && (
                    <span className="text-xs opacity-60">
                      [{state.position.lat.toFixed(2)}, {state.position.lng.toFixed(2)}]
                    </span>
                  )
                }
                disabled={!state.position && !inputValue}
                onChange={e => {
                  setInputValue(e.target.value);
                  setShowSuggestions(true);
                }}
                onBlur={async (e) => {
                  setTimeout(() => setShowSuggestions(false), 200); // 延迟隐藏，保证点击候选项有效
                  const value = e.target.value.trim();
                  if (!value) return;
                  // 只有选中候选项时才自动定位，否则不自动定位
                }}
              />
              {/* 候选下拉框 */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 top-full left-0 w-full bg-white border border-gray-200 rounded shadow max-h-48 overflow-y-auto">
                  {suggestions.map((tip, idx) => (
                    <div
                      key={tip.id || tip.name + idx}
                      className="px-3 py-2 cursor-pointer hover:bg-gray-100 text-sm"
                      onMouseDown={() => {
                        setInputValue(tip.name);
                        setShowSuggestions(false);
                        if (tip.location) {
                          const [lng, lat] = tip.location.split(',').map(Number);
                          setState(prev => ({
                            ...prev,
                            position: new LatLng(lat, lng),
                            placeholder: tip.name,
                            initilized: true,
                          }));
                        }
                      }}
                    >
                      {tip.name}
                      {tip.district ? <span className="ml-2 text-xs text-gray-400">{tip.district}</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button
              className="shrink-0"
              color="primary"
              size="sm"
              onClick={() => {
                props.onChange(
                  Location.fromPartial({
                    placeholder: state.placeholder,
                    latitude: state.position?.lat,
                    longitude: state.position?.lng,
                  }),
                );
                setPopoverOpen(false);
              }}
              disabled={!state.position || state.placeholder.length === 0}
            >
              {t("common.confirm")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default LocationSelector;
