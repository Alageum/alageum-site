import { cityPoint, enterpriseCities } from '@/lib/public/company';
import { locationsInCity } from '@/lib/public/enterprise-map-locations';
import { mapRegions } from '@/lib/public/enterprise-map-regions';
import { getManufacturerPhoto } from '@/lib/public/photography';
import { SectionHeading } from './CorporateParts';
import HomeEnterpriseExplorer from './HomeEnterpriseExplorer';
import './HomeEnterpriseMap.css';

// Separate the two neighbouring controls while keeping their dots at the city centres.
const pinOffsets = { kentau: [-95, -64], shymkent: [-8, 40] };
const cities = enterpriseCities.map((city, index) => {
  const point = cityPoint(city);
  const [dx, dy] = pinOffsets[city.id] || [0, 0];
  const factories = locationsInCity(city.title).filter(item => item.kind === 'enterprise');
  return {
    id: city.id,
    title: city.title,
    number: index + 1,
    point,
    pin: { x: point.x + dx, y: point.y + dy },
    region: mapRegions.find(region => region.cities.includes(city.id))?.osmId,
    photo: getManufacturerPhoto(factories[0]?.id),
    factories: factories.map(({ id, title, href, capabilities }) => ({
      id, title, href, capabilities: capabilities.slice(0, 2),
    })),
  };
});

const regions = mapRegions.map(({ osmId, path }) => ({ id: osmId, path }));

export default function HomeEnterpriseMap() {
  return <section id="home-enterprises" className="corp-home-enterprises">
    <div className="site-container corp-section">
      <SectionHeading number="04" label="ПРЕДПРИЯТИЯ" title="Производим в Казахстане" href="/manufacturers#company-map" link="Все предприятия и офисы" />
      <HomeEnterpriseExplorer cities={cities} regions={regions} overviewPhoto={getManufacturerPhoto('asia-trafo')} />
    </div>
  </section>;
}
